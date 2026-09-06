/**
 * Compiles contracts/*.sol with solc-js into contracts/out/artifacts.json (ABI + creation
 * bytecode per contract). Run with `npm run contracts:build`; the artifacts are committed so the
 * hosts, the Worker and the probe never need the compiler at runtime.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const solc = require("solc") as { compile: (input: string) => string };

export interface Artifact {
  abi: unknown[];
  bytecode: `0x${string}`;
}

export function compileContracts(dir = "contracts"): Record<string, Artifact> {
  const sources: Record<string, { content: string }> = {};
  for (const f of readdirSync(dir)) if (f.endsWith(".sol")) sources[f] = { content: readFileSync(resolve(dir, f), "utf8") };
  const input = { language: "Solidity", sources, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } };
  const out = JSON.parse(solc.compile(JSON.stringify(input))) as { errors?: { severity: string; formattedMessage: string }[]; contracts: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>> };
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  const artifacts: Record<string, Artifact> = {};
  for (const file of Object.values(out.contracts)) for (const [name, c] of Object.entries(file)) if (c.evm.bytecode.object) artifacts[name] = { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` };
  return artifacts;
}

if (process.argv[1] && /compile\.ts$/.test(process.argv[1])) {
  const artifacts = compileContracts();
  mkdirSync("contracts/out", { recursive: true });
  writeFileSync("contracts/out/artifacts.json", JSON.stringify(artifacts, null, 1));
  for (const [n, a] of Object.entries(artifacts)) console.log(`${n.padEnd(14)} ${(a.bytecode.length / 2 - 1).toString().padStart(6)} bytes · ${a.abi.length} abi entries`);
}
