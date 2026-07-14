import { R2Bucket } from "../../binding.js";
import {
  FileSystemR2Service,
  type FileSystemR2ServiceOptions,
} from "./filesystem.js";

export { FileSystemR2Service } from "./filesystem.js";
export type { FileSystemR2ServiceOptions } from "./filesystem.js";

export function createFileSystemR2Bucket(
  options: FileSystemR2ServiceOptions | string,
): R2Bucket {
  return new R2Bucket(new FileSystemR2Service(options));
}
