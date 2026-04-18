#!/usr/bin/env node
// Tags each question in data/SAA-C03.json with AWS service categories based on
// keyword matches in the question text and options. Idempotent — rerunning
// overwrites the `tags` field with the freshly computed set.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, "..", "data", "SAA-C03.json");

// Each entry: [regex, category]. Regex uses \b word boundaries so "S3" doesn't
// match "SMS3" etc. Order doesn't matter — all matches union into tags Set.
const RULES = [
  // ── compute ────────────────────────────────────────────────────────────
  [/\bEC2\b/i, "compute"],
  [/\bLambda\b/i, "compute"],
  [/\bFargate\b/i, "compute"],
  [/\bECS\b/, "compute"],
  [/\bEKS\b/, "compute"],
  [/\bAuto[- ]?Scaling\b/i, "compute"],
  [/\bElastic Beanstalk\b/i, "compute"],
  [/\bAWS Batch\b/i, "compute"],
  [/\bLightsail\b/i, "compute"],
  [/\bOutposts\b/i, "compute"],
  [/\bApp Runner\b/i, "compute"],
  [/\bWavelength\b/i, "compute"],
  [/\bLocal Zones?\b/i, "compute"],
  [/\bSpot Instances?\b/i, "compute"],
  [/\bReserved Instances?\b/i, "compute"],
  [/\bSavings Plans?\b/i, "compute"],

  // ── storage ────────────────────────────────────────────────────────────
  [/\bAmazon S3\b/i, "storage"],
  [/\bS3 bucket\b/i, "storage"],
  [/\bS3 Standard\b/i, "storage"],
  [/\bS3 Glacier\b/i, "storage"],
  [/\bS3 Intelligent-Tiering\b/i, "storage"],
  [/\bS3 One Zone\b/i, "storage"],
  [/\bS3 Lifecycle\b/i, "storage"],
  [/\bS3 Transfer Acceleration\b/i, "storage"],
  [/\b(?<![A-Z])S3(?![A-Za-z0-9])/i, "storage"],
  [/\bEBS\b/, "storage"],
  [/\bElastic Block Store\b/i, "storage"],
  [/\bEFS\b/, "storage"],
  [/\bElastic File System\b/i, "storage"],
  [/\bFSx\b/i, "storage"],
  [/\bGlacier\b/i, "storage"],
  [/\bStorage Gateway\b/i, "storage"],
  [/\bAWS Backup\b/i, "storage"],

  // ── databases ──────────────────────────────────────────────────────────
  [/\bRDS\b/, "database"],
  [/\bAurora\b/i, "database"],
  [/\bDynamoDB\b/i, "database"],
  [/\bRedshift\b/i, "database"],
  [/\bElastiCache\b/i, "database"],
  [/\bDocumentDB\b/i, "database"],
  [/\bNeptune\b/i, "database"],
  [/\bTimestream\b/i, "database"],
  [/\bQLDB\b/i, "database"],
  [/\bKeyspaces\b/i, "database"],
  [/\bMemoryDB\b/i, "database"],
  [/\bDatabase Migration Service\b/i, "database"],
  [/\bMemcached\b/i, "database"],
  [/\bRedis\b/i, "database"],
  [/\bMySQL\b/i, "database"],
  [/\bPostgreSQL\b/i, "database"],
  [/\bOracle\b/i, "database"],
  [/\bMariaDB\b/i, "database"],
  [/\bSQL Server\b/i, "database"],

  // ── networking ─────────────────────────────────────────────────────────
  [/\bVPC\b/, "networking"],
  [/\bVPCs\b/, "networking"],
  [/\bCloudFront\b/i, "networking"],
  [/\bRoute ?53\b/i, "networking"],
  [/\bAPI Gateway\b/i, "networking"],
  [/\bDirect Connect\b/i, "networking"],
  [/\bTransit Gateway\b/i, "networking"],
  [/\b(Application |Network |Gateway |Classic )?Load Balancer\b/i, "networking"],
  [/\bELB\b/, "networking"],
  [/\bALB\b/, "networking"],
  [/\bNLB\b/, "networking"],
  [/\bGlobal Accelerator\b/i, "networking"],
  [/\bPrivateLink\b/i, "networking"],
  [/\bVPN\b/, "networking"],
  [/\bNAT Gateway\b/i, "networking"],
  [/\bInternet Gateway\b/i, "networking"],
  [/\bVPC Endpoints?\b/i, "networking"],
  [/\bVPC Peering\b/i, "networking"],
  [/\bSecurity Groups?\b/i, "networking"],
  [/\bNetwork ACL\b/i, "networking"],
  [/\bsubnets?\b/i, "networking"],
  [/\bApp Mesh\b/i, "networking"],
  [/\bCloud Map\b/i, "networking"],

  // ── security & IAM ─────────────────────────────────────────────────────
  [/\bIAM\b/, "security"],
  [/\bGuardDuty\b/i, "security"],
  [/\bKMS\b/, "security"],
  [/\bKey Management Service\b/i, "security"],
  [/\bMacie\b/i, "security"],
  [/\bShield\b/i, "security"],
  [/\bWAF\b/, "security"],
  [/\bCognito\b/i, "security"],
  [/\bSecrets Manager\b/i, "security"],
  [/\bCertificate Manager\b/i, "security"],
  [/\bACM\b/, "security"],
  [/\bCloudHSM\b/i, "security"],
  [/\bInspector\b/i, "security"],
  [/\bDetective\b/i, "security"],
  [/\bSecurity Hub\b/i, "security"],
  [/\bFirewall Manager\b/i, "security"],
  [/\bNetwork Firewall\b/i, "security"],
  [/\bIdentity Center\b/i, "security"],
  [/\bSSO\b/, "security"],
  [/\bSTS\b/, "security"],
  [/\bDirectory Service\b/i, "security"],
  [/\bActive Directory\b/i, "security"],
  [/\bIAM roles?\b/i, "security"],
  [/\bIAM polic(y|ies)\b/i, "security"],

  // ── analytics ──────────────────────────────────────────────────────────
  [/\bAthena\b/i, "analytics"],
  [/\bEMR\b/, "analytics"],
  [/\bKinesis\b/i, "analytics"],
  [/\bQuickSight\b/i, "analytics"],
  [/\bAWS Glue\b/i, "analytics"],
  [/\bLake Formation\b/i, "analytics"],
  [/\bMSK\b/, "analytics"],
  [/\bManaged Streaming for (Apache )?Kafka\b/i, "analytics"],
  [/\bOpenSearch\b/i, "analytics"],
  [/\bElasticsearch Service\b/i, "analytics"],
  [/\bData Pipeline\b/i, "analytics"],
  [/\bData Exchange\b/i, "analytics"],
  [/\bFinSpace\b/i, "analytics"],

  // ── ML / AI ────────────────────────────────────────────────────────────
  [/\bSageMaker\b/i, "ml-ai"],
  [/\bBedrock\b/i, "ml-ai"],
  [/\bRekognition\b/i, "ml-ai"],
  [/\bLex\b/, "ml-ai"],
  [/\bTextract\b/i, "ml-ai"],
  [/\bPolly\b/i, "ml-ai"],
  [/\bTranscribe\b/i, "ml-ai"],
  [/\bTranslate\b/i, "ml-ai"],
  [/\bComprehend\b/i, "ml-ai"],
  [/\bPersonalize\b/i, "ml-ai"],
  [/\bForecast\b/i, "ml-ai"],
  [/\bKendra\b/i, "ml-ai"],
  [/\bFraud Detector\b/i, "ml-ai"],

  // ── developer tools ────────────────────────────────────────────────────
  [/\bCodePipeline\b/i, "developer"],
  [/\bCodeBuild\b/i, "developer"],
  [/\bCodeDeploy\b/i, "developer"],
  [/\bCodeCommit\b/i, "developer"],
  [/\bCodeArtifact\b/i, "developer"],
  [/\bCodeStar\b/i, "developer"],
  [/\bCloud9\b/i, "developer"],
  [/\bCDK\b/, "developer"],
  [/\bX-Ray\b/i, "developer"],
  [/\bCloudShell\b/i, "developer"],

  // ── management & governance ────────────────────────────────────────────
  [/\bCloudFormation\b/i, "management"],
  [/\bCloudWatch\b/i, "management"],
  [/\bCloudTrail\b/i, "management"],
  [/\bTrusted Advisor\b/i, "management"],
  [/\bCost Explorer\b/i, "management"],
  [/\bSystems Manager\b/i, "management"],
  [/\bAWS Config\b/i, "management"],
  [/\bOrganizations\b/i, "management"],
  [/\bControl Tower\b/i, "management"],
  [/\bService Catalog\b/i, "management"],
  [/\bOpsWorks\b/i, "management"],
  [/\bBudgets?\b/i, "management"],
  [/\bService Quotas\b/i, "management"],
  [/\bCompute Optimizer\b/i, "management"],
  [/\bLicense Manager\b/i, "management"],
  [/\bResource Groups?\b/i, "management"],
  [/\bSSM\b/, "management"],

  // ── messaging / integration ────────────────────────────────────────────
  [/\bSQS\b/, "messaging"],
  [/\bSNS\b/, "messaging"],
  [/\bEventBridge\b/i, "messaging"],
  [/\bStep Functions\b/i, "messaging"],
  [/\bAmazon MQ\b/i, "messaging"],
  [/\bSES\b/, "messaging"],
  [/\bAppFlow\b/i, "messaging"],
  [/\bSWF\b/, "messaging"],
  [/\bSimple Queue Service\b/i, "messaging"],
  [/\bSimple Notification Service\b/i, "messaging"],

  // ── IoT ────────────────────────────────────────────────────────────────
  [/\bIoT Core\b/i, "iot"],
  [/\bGreengrass\b/i, "iot"],
  [/\bSiteWise\b/i, "iot"],
  [/\bTwinMaker\b/i, "iot"],
  [/\bFreeRTOS\b/i, "iot"],
  [/\bIoT Analytics\b/i, "iot"],
  [/\bIoT Device Defender\b/i, "iot"],

  // ── migration & transfer ───────────────────────────────────────────────
  [/\bDMS\b/, "migration"],
  [/\bDataSync\b/i, "migration"],
  [/\bSnow ?ball\b/i, "migration"],
  [/\bSnow ?cone\b/i, "migration"],
  [/\bSnow ?mobile\b/i, "migration"],
  [/\bSnow Family\b/i, "migration"],
  [/\bSnowball Edge\b/i, "migration"],
  [/\bApplication Migration\b/i, "migration"],
  [/\bServer Migration\b/i, "migration"],
  [/\bTransfer Family\b/i, "migration"],
  [/\bMigration Hub\b/i, "migration"],
  [/\bSchema Conversion Tool\b/i, "migration"],
  [/\bMGN\b/, "migration"],

  // ── containers (bucketed under compute, but useful extras) ─────────────
  [/\bKubernetes\b/i, "compute"],
  [/\bDocker\b/i, "compute"],
  [/\bECR\b/, "compute"],
];

function tagsFor(question) {
  const haystack = [
    question.question ?? "",
    ...Object.values(question.options ?? {}),
  ].join("\n");

  const tags = new Set();
  for (const [pattern, tag] of RULES) {
    if (pattern.test(haystack)) tags.add(tag);
  }
  return [...tags].sort();
}

function main() {
  const raw = readFileSync(DATA_PATH, "utf8");
  const data = JSON.parse(raw);

  let untagged = 0;
  const histogram = new Map();

  for (const q of data.questions) {
    const tags = tagsFor(q);
    q.tags = tags;
    if (tags.length === 0) untagged++;
    for (const t of tags) histogram.set(t, (histogram.get(t) ?? 0) + 1);
  }

  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n");

  console.log(`Tagged ${data.questions.length} questions`);
  console.log(`Untagged: ${untagged}`);
  console.log("Tag distribution:");
  for (const [tag, n] of [...histogram.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tag.padEnd(12)} ${n}`);
  }
}

main();
