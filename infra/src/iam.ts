import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export function createIamResources(
  s3BucketArn: pulumi.Output<string>,
  hostedZoneId: string
) {
  const role = new aws.iam.Role("openclaw-unified-role", {
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "ec2.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
    tags: { Name: "openclaw-unified-role", Project: "OpenClaw" },
  });

  // S3: 워크스페이스 tarball 다운로드
  new aws.iam.RolePolicy("openclaw-s3-policy", {
    role: role.id,
    policy: pulumi.output(s3BucketArn).apply((arn) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["s3:GetObject"],
            Resource: `${arn}/*`,
          },
        ],
      })
    ),
  });

  // Route53: Traefik DNS Challenge (와일드카드 인증서)
  new aws.iam.RolePolicy("openclaw-route53-policy", {
    role: role.id,
    policy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: ["route53:GetChange", "route53:ListHostedZones"],
          Resource: "*",
        },
        {
          Effect: "Allow",
          Action: ["route53:ChangeResourceRecordSets"],
          Resource: `arn:aws:route53:::hostedzone/${hostedZoneId}`,
        },
      ],
    }),
  });

  const instanceProfile = new aws.iam.InstanceProfile(
    "openclaw-unified-profile",
    {
      role: role.name,
      tags: { Name: "openclaw-unified-profile", Project: "OpenClaw" },
    }
  );

  return { role, instanceProfile };
}
