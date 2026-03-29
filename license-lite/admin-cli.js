#!/usr/bin/env node
const { loadEnvironment, readConfig } = require("./lib/config");
const { openDatabase } = require("./lib/database");
const { createLicenseService } = require("./lib/license-service");

loadEnvironment();

const config = readConfig();
const db = openDatabase(config);
const service = createLicenseService({ db, config });

const [command, ...rest] = process.argv.slice(2);
const args = parseFlags(rest);

try {
  switch (command) {
    case "create-license":
      requireFlag(args, "sku");
      print(service.createLicense({
        sku: args.sku,
        durationDays: args["duration-days"],
        buyerId: args.buyer,
        orderId: args.order,
        wechatNote: args["wechat-note"],
        orderNote: args["order-note"],
        activationLimit: args["activation-limit"],
        licenseKey: args.license,
      }));
      break;
    case "reset-activation":
      requireFlag(args, "license");
      print(service.resetActivation({
        licenseKey: args.license,
        hardwareId: args.hardware,
      }));
      break;
    case "revoke-license":
      requireFlag(args, "license");
      print(service.revokeLicense({
        licenseKey: args.license,
        reason: args.reason,
      }));
      break;
    case "renew-license":
      requireFlag(args, "license");
      requireFlag(args, "sku");
      print(service.renewLicense({
        licenseKey: args.license,
        sku: args.sku,
        durationDays: args["duration-days"],
      }));
      break;
    case "show-license":
      requireFlag(args, "license");
      print(service.getLicenseDetail(args.license));
      break;
    case "list-licenses":
      print(service.listLicenses(args.limit));
      break;
    default:
      printHelp();
      process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  db.close();
}

function parseFlags(tokens) {
  const result = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = tokens[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

function requireFlag(flags, key) {
  if (`${flags[key] || ""}`.trim()) {
    return;
  }

  throw new Error(`Missing required flag: --${key}`);
}

function print(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function printHelp() {
  console.log(`Usage:
  node admin-cli.js create-license --sku cn_30d --buyer wx_001 [--duration-days 3] [--order wx-order-001] [--wechat-note "buyer note"] [--order-note "wechat paid"]
  node admin-cli.js reset-activation --license NAT-XXXX-XXXX-XXXX-XXXX [--hardware <hardware-id>]
  node admin-cli.js revoke-license --license NAT-XXXX-XXXX-XXXX-XXXX [--reason refund]
  node admin-cli.js renew-license --license NAT-XXXX-XXXX-XXXX-XXXX --sku cn_30d [--duration-days 3]
  node admin-cli.js show-license --license NAT-XXXX-XXXX-XXXX-XXXX
  node admin-cli.js list-licenses [--limit 20]`);
}
