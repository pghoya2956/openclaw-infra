import * as pulumi from "@pulumi/pulumi";
import { getLabPersona, awsConfig } from "./src/config";
import { createSecurityGroup } from "./src/security";
import { createInstance } from "./src/ec2";
import { createDnsRecord } from "./src/dns";

// Phase 0: Single server deployment (lab persona)
const persona = getLabPersona();

// Create Security Group
const securityGroup = createSecurityGroup(persona.name);

// Create EC2 Instance
const instance = createInstance(persona, securityGroup.id);

// Create DNS Record
const dnsRecord = createDnsRecord(persona, instance.publicIp);

// Exports
export const personaName = persona.name;
export const instanceId = instance.id;
export const publicIp = instance.publicIp;
export const domain = pulumi.interpolate`${persona.subdomain}.${awsConfig.baseDomain}`;
export const gatewayUrl = pulumi.interpolate`https://${persona.subdomain}.${awsConfig.baseDomain}`;
export const sshCommand = pulumi.interpolate`ssh -i ~/.ssh/id_ed25519 ec2-user@${instance.publicIp}`;
