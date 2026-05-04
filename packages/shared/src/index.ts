export type ISODateTimeString = string;
export type UUID = string;

export const FOUNDATION_SLICE = "S00-operating-layer-and-contract-build-baseline";

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
