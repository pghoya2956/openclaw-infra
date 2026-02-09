import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { PersonaConfig, awsConfig, infraConfig } from "./config";
import { generateUserData } from "./userdata";

// Get latest Amazon Linux 2023 AMI
const ami = aws.ec2.getAmi({
  mostRecent: true,
  owners: ["amazon"],
  filters: [
    {
      name: "name",
      values: ["al2023-ami-*-x86_64"],
    },
    {
      name: "virtualization-type",
      values: ["hvm"],
    },
  ],
});

export function createInstance(
  persona: PersonaConfig,
  securityGroupId: pulumi.Input<string>
) {
  const domain = `${persona.subdomain}.${awsConfig.baseDomain}`;
  const userData = generateUserData(persona, domain);

  return new aws.ec2.Instance(`openclaw-${persona.name}`, {
    ami: ami.then((a) => a.id),
    instanceType: persona.instanceType,
    subnetId: awsConfig.subnetId,
    vpcSecurityGroupIds: [securityGroupId],
    keyName: awsConfig.keyName,
    associatePublicIpAddress: true,

    rootBlockDevice: {
      volumeSize: persona.volumeSize,
      volumeType: "gp3",
      deleteOnTermination: true,
    },

    userData: userData,
    userDataReplaceOnChange: true,

    tags: {
      Name: `openclaw-${persona.name}`,
      Project: "OpenClaw",
      Persona: persona.name,
      ...infraConfig.tags,
    },
  });
}
