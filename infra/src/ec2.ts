import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { DeployConfig, awsConfig, infraConfig } from "./config";
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
  config: DeployConfig,
  securityGroupId: pulumi.Input<string>,
  instanceProfileName: pulumi.Input<string>,
  s3BucketId: pulumi.Output<string>
) {
  // User Data 스크립트에 S3 버킷 이름을 주입
  // Pulumi Output → apply로 최종 스크립트 생성
  const userData = s3BucketId.apply((bucketName) =>
    generateUserData(config, bucketName)
  );

  return new aws.ec2.Instance("openclaw-unified", {
    ami: ami.then((a) => a.id),
    instanceType: config.instance.type,
    subnetId: awsConfig.subnetId,
    vpcSecurityGroupIds: [securityGroupId],
    keyName: awsConfig.keyName,
    associatePublicIpAddress: true,
    iamInstanceProfile: instanceProfileName,

    rootBlockDevice: {
      volumeSize: config.instance.volumeSize,
      volumeType: "gp3",
      deleteOnTermination: true,
    },

    userData: userData,
    userDataReplaceOnChange: true,

    tags: {
      Name: "openclaw-unified",
      Project: "OpenClaw",
      Architecture: "unified-multiagent",
      Agents: config.agents.map((a) => a.id).join(","),
      ...infraConfig.tags,
    },
  });
}
