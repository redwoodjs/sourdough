import {
  DurableObject,
} from "../durable-object/index.js";
import { InstanceContainer, DurableObjectConstructor } from "./runtime.js";
import { SqliteStorage, InMemoryStorage, getSqliteDriver } from "./storage.js"; // Needs persistence
import { createServer } from "node:http";
import path from "node:path";
import fs from "node:fs";

// Arguments: socketPath, storageDir, [UserHostPath?]
// We need to know where the User's DO code is?
// The Registry (Coordinator) knows the Class.
// But the HostProcess needs to load the Class.
// Option 1: Registry sends the file path and export name in a control message?
// Option 2: HostProcess is started with the User Code entry point as an argument?
// Option 3: We assume a monolithic build where HostProcess imports the same user code.

// The user runs an application entry point that imports this package.
// The coordinator starts host processes that load the application's actor classes.
// The `host-entry.ts` must import the user's DO classes.

// Solution: The `HostProcess` is generic, but it needs a mechanism to resolve the DO class.
// We can pass the module path as an argument.
// `node --import tsx src/host/process.ts --socket ... --module /path/to/user/code.ts --export MyActor`
// Or simpler: The Registry passes the Class *Constructor* to `get()`, but when it's remote...
// The Registry needs to tell the Remote Host "Load class X from file Y".

// Let's assume for this "Single Machine" iteration that we are running in a mode where
// we can dynamic import.

// Minimal arguments for now:
// --socket <path>
// --storage <path>

// We need a way to Map ID -> Class.
// The Router knows `Ctor`.
// But the Router is outside.
// The Router sends request to Worker.
// URL: `/?id=...`
// The Host Process needs to instantiate the object.
// It needs the Ctor.
// If the Host is generic, it doesn't know the Ctor.

// Re-read "2. The 'Single Machine' Process Model"
// "The Registry Process: A single, lightweight coordinator."
// "The Durable Host Pool: A set of processes ... that actually host the objects."

// If I start a Host Pool, they need to be able to host *any* object?
// Or specific objects?
// Usually Durable Objects are bound to a class.
// A Host *instance* (isolate) hosts a class.
// In Cloudflare, you upload specific script.

// Here, the user has `class MyDO extends ...`.
// They pass `registry.get(id, MyDO)`.
// If `Registry` decides "MyDO" lives on "Host-1",
// "Host-1" must have `MyDO` code.

// If `Host-1` is a separate process spawned by Registry...
// It should probably load the same bundle or entry point as the main process?
// Or we spawn the *User's Entry Point* with a flag?
// `node --import tsx user-script.ts --host --socket ...`
// This ensures `MyDO` is defined.
// The user script must have logic to start the Host if the flag is present.

// OR, we use a loader.
// `node --import tsx src/host/process.ts --entry /absolute/path/to/user/script.ts`
// And `process.ts` imports that script.
// But we need to know *which* export is the DO class.

// Let's try the "Loader" approach.
// When `Router` requests `registry.get(id, Ctor)`, `Ctor.name` is available.
// We can pass `className` in the request headers?
// And the Worker Process must have imported the file containing that class.

// To simplify verification:
// We will allow `process.ts` to accept `--import <file>` arguments.
// It will import those files.
// We assume the classes are registered in a global map?
// OR, `DurableObject` classes register themselves?

// Let's implement a simple `ClassRegistry` in `durable-object/index.ts`?
// No, that pollutes the base class.

// Better: Pass `className` and `importPath` in the request to the Host?
// "Lazy load code"?
// `GET /?id=123&import=./my-do.ts&class=MyDO`
// Security risk? Local machine, maybe acceptable.

// Implementation:
// Parse args.
// Start Server.
// On Request:
//   Extract ID, ImportPath, ClassName.
//   Import module.
//   Find Class.
//   Get/Create Instance.
//   Execute Fetch.

async function start() {
    const args = process.argv.slice(2);
    const socketArg = args.indexOf("--socket");
    const socketPath = socketArg !== -1 ? args[socketArg + 1] : "/tmp/do-host.sock";
    
    const storageArg = args.indexOf("--storage");
    const storageDir = storageArg !== -1 ? args[storageArg + 1] : "./.storage";

    // Ensure storage dir
    if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
    }

    // Helper to load class
    const classCache = new Map<string, any>();
    
    async function loadClass(modulePath: string, className: string) {
        const key = `${modulePath}::${className}`;
        if (classCache.has(key)) return classCache.get(key);
        
        // Dynamic import
        // If relative, resolve relative to CWD?
        const resolvedPath = path.resolve(process.cwd(), modulePath);
        const module = await import(resolvedPath);
        const Ctor = module[className];
        
        if (!Ctor) throw new Error(`Class ${className} not found in ${modulePath}`);
        classCache.set(key, Ctor);
        return Ctor;
    }

    // Single runtime instance for this process
    // But runtime needs 'storage'.
    // Storage is per-object (Sqlite file).
    // The `InstanceContainer` takes `storage`.
    // We don't have a global "Runtime" object, we have `InstanceContainer`s.
    // We need a map of `id -> InstanceContainer`.
    
    const containers = new Map<string, InstanceContainer>();

    // We need an "Env" object?
    const globalEnv = process.env;

    const requestHandler = async (req: Request): Promise<Response> => {
        try {
            const url = new URL(req.url);
            const id = url.searchParams.get("id");
            const modulePath = url.searchParams.get("module");
            const className = url.searchParams.get("class");
            
            if (!id || !modulePath || !className) {
                return new Response("Missing id, module, or class params", { status: 400 });
            }

            const Ctor = await loadClass(modulePath, className);

            let container = containers.get(id);
            if (!container) {
                 const dbPath = path.join(storageDir, `${id}.sqlite`);
                 const Driver = await getSqliteDriver();
                 const db = new Driver(dbPath); // This might fail if locked? 
                 // If locked, we should retry or fail? 
                 // SQLite should handle locking if we use WAL/proper mode.
                 // But strictly, only ONE process should open it.
                 // The Registry ensures placement.
                 
                 const storage = new SqliteStorage(db);
                 container = new InstanceContainer(id, storage, globalEnv);
                 containers.set(id, container);
            }

            const instance = await container.getInstance(Ctor);
            return await container.executeFetch(req, instance);
            
        } catch (e: any) {
            console.error("Host Process Error:", e);
            return new Response(e.stack || e.message, { status: 500 });
        }
    };

    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);

    const server = createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) {
                value.forEach(item => headers.append(name, item));
            } else if (value) {
                headers.set(name, value);
            }
        }

        const webReq = new Request(url, {
            method: req.method,
            headers,
            body: req.method === "GET" || req.method === "HEAD" ? null : req as any,
            // @ts-expect-error Node.js requires duplex for streamed request bodies.
            duplex: "half",
        });
        const webRes = await requestHandler(webReq);

        res.statusCode = webRes.status;
        webRes.headers.forEach((value, name) => res.setHeader(name, value));
        res.end(webRes.body ? Buffer.from(await webRes.arrayBuffer()) : undefined);
    });

    server.listen(socketPath, () => {
        console.log(`Host Process listening on ${socketPath}`);
    });
}

start();
