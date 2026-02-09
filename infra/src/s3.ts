import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { AgentConfig } from "./schema";

/**
 * S3 버킷 생성 + 워크스페이스 tarball 업로드
 *
 * tarball 구조:
 *   workspace-{agentId}/SOUL.md
 *   workspace-{agentId}/IDENTITY.md
 *   workspace-{agentId}/skills/delegate/SKILL.md (CEO만)
 *
 * Pulumi AssetArchive로 에이전트별 파일을 하나의 S3 Object로 업로드.
 * EC2 User Data에서 tar xzf로 압축 해제하여 각 에이전트 워크스페이스에 배치.
 */
export function createS3Resources(agents: AgentConfig[]) {
  const bucket = new aws.s3.Bucket("openclaw-workspaces", {
    forceDestroy: true,
    tags: { Name: "openclaw-workspaces", Project: "OpenClaw" },
  });

  // 에이전트별 워크스페이스 파일을 하나의 JSON manifest로 업로드
  // (tar.gz는 Pulumi에서 바이너리 생성이 복잡하므로, JSON manifest + 개별 파일 방식)
  const manifest: Record<
    string,
    { relativePath: string; content: string }[]
  > = {};
  for (const agent of agents) {
    manifest[agent.id] = agent.workspace.map((f) => ({
      relativePath: f.relativePath,
      content: f.content,
    }));
  }

  const manifestObject = new aws.s3.BucketObject(
    "openclaw-workspace-manifest",
    {
      bucket: bucket.id,
      key: "workspace-manifest.json",
      content: JSON.stringify(manifest),
      contentType: "application/json",
    }
  );

  return {
    bucket,
    bucketName: bucket.id,
    bucketArn: bucket.arn,
    manifestKey: pulumi.output("workspace-manifest.json"),
  };
}
