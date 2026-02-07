import * as pulumi from "@pulumi/pulumi";
import { getPersonas, awsConfig, infraConfig } from "./src/config";
import { createSecurityGroup } from "./src/security";
import { createInstance } from "./src/ec2";
import { createDnsRecord } from "./src/dns";

// Phase 1: Multi-persona deployment
const personas = getPersonas();

// Shared Security Group (keep "lab" resource name to prevent Pulumi replace)
const securityGroup = createSecurityGroup("lab");

// Per-persona resources
const results = personas.map((persona) => {
  const instance = createInstance(persona, securityGroup.id);
  const dns = createDnsRecord(persona, instance.publicIp);
  return { persona, instance, dns };
});

// Exports
export const deployedPersonas = results.map((r) => ({
  name: r.persona.name,
  instanceId: r.instance.id,
  publicIp: r.instance.publicIp,
  domain: `${r.persona.subdomain}.${awsConfig.baseDomain}`,
  sshCommand: pulumi.interpolate`ssh -i ${infraConfig.sshKeyPath} ec2-user@${r.instance.publicIp}`,
}));
