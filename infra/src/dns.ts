import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { AgentConfig, awsConfig } from "./config";

export function createDnsRecords(
  agents: AgentConfig[],
  publicIp: pulumi.Output<string>
) {
  return agents.map(
    (agent) =>
      new aws.route53.Record(`openclaw-${agent.id}-dns`, {
        zoneId: awsConfig.hostedZoneId,
        name: agent.subdomain,
        type: "A",
        ttl: 300,
        records: [publicIp],
      })
  );
}
