import * as aws from "@pulumi/aws";
import { awsConfig } from "./config";

export function createSecurityGroup(name: string) {
  return new aws.ec2.SecurityGroup(`${name}-sg`, {
    name: `openclaw-${name}-sg`,
    description: `Security group for OpenClaw ${name} instance`,
    vpcId: awsConfig.vpcId,

    ingress: [
      // SSH
      {
        protocol: "tcp",
        fromPort: 22,
        toPort: 22,
        cidrBlocks: ["0.0.0.0/0"],
        description: "SSH access",
      },
      // HTTP (for Let's Encrypt challenge)
      {
        protocol: "tcp",
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ["0.0.0.0/0"],
        description: "HTTP for ACME challenge",
      },
      // HTTPS
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ["0.0.0.0/0"],
        description: "HTTPS access",
      },
    ],

    egress: [
      // Allow all outbound
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
        description: "Allow all outbound",
      },
    ],

    tags: {
      Name: `openclaw-${name}-sg`,
      Project: "OpenClaw",
      Persona: name,
    },
  });
}
