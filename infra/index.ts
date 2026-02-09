import * as pulumi from "@pulumi/pulumi";
import { getDeployConfig, awsConfig, infraConfig } from "./src/config";
import { createIamResources } from "./src/iam";
import { createS3Resources } from "./src/s3";
import { createSecurityGroup } from "./src/security";
import { createInstance } from "./src/ec2";
import { createDnsRecords } from "./src/dns";

// --- Load config ---
const config = getDeployConfig();

// --- S3 (워크스페이스 업로드) ---
const { bucketName, bucketArn } = createS3Resources(config.agents);

// --- IAM (S3 + Route53 권한) ---
const { instanceProfile } = createIamResources(
  bucketArn,
  awsConfig.hostedZoneId
);

// --- Security Group (keep "lab" resource name to prevent Pulumi replace) ---
const securityGroup = createSecurityGroup("lab");

// --- EC2 (단일 통합 인스턴스) ---
const instance = createInstance(
  config,
  securityGroup.id,
  instanceProfile.name,
  bucketName
);

// --- DNS (에이전트별 A record → 동일 IP) ---
const dnsRecords = createDnsRecords(config.agents, instance.publicIp);

// --- Exports ---
export const deployment = {
  instanceId: instance.id,
  publicIp: instance.publicIp,
  agents: config.agents.map((a) => ({
    id: a.id,
    domain: `${a.subdomain}.${awsConfig.baseDomain}`,
  })),
  sshCommand: pulumi.interpolate`ssh -i ${infraConfig.sshKeyPath} ec2-user@${instance.publicIp}`,
  s3Bucket: bucketName,
};
