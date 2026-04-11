import { TEMPLATE_TYPE } from "../../../src/core/enums/index.mts";
import type { TemplateType } from "../../../src/core/enums/index.mts";
import type {
  ITemplate,
  IFeatureSpec,
  IGeneratedFile,
  IRenderedFile,
  IValidationResult,
  IGenerationContext,
} from "../../../src/core/interfaces/index.mts";

function renderStackTs(projectName: string): string {
  const className = toPascalCase(projectName);

  return `import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

export class ${className}Stack extends cdk.Stack {

  public readonly api: apigateway.RestApi;
  public readonly table: dynamodb.Table;
  public readonly queue: sqs.Queue;
  public readonly handler: lambda.Function;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.table = this.createDynamoTable();
    this.queue = this.createSqsQueue();
    this.handler = this.createLambdaFunction();
    this.api = this.createApiGateway();

    this.grantPermissions();
    this.createOutputs();
  }

  private createDynamoTable(): dynamodb.Table {
    return new dynamodb.Table(this, "${className}Table", {
      tableName: "${projectName}-table",
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "createdAt",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });
  }

  private createSqsQueue(): sqs.Queue {
    const dlq = new sqs.Queue(this, "${className}DLQ", {
      queueName: "${projectName}-dlq",
      retentionPeriod: cdk.Duration.days(14),
    });

    return new sqs.Queue(this, "${className}Queue", {
      queueName: "${projectName}-queue",
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3,
      },
    });
  }

  private createLambdaFunction(): lambda.Function {
    return new lambda.Function(this, "${className}Handler", {
      functionName: "${projectName}-handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda"),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: this.table.tableName,
        QUEUE_URL: this.queue.queueUrl,
        NODE_ENV: "production",
      },
    });
  }

  private createApiGateway(): apigateway.RestApi {
    const api = new apigateway.RestApi(this, "${className}Api", {
      restApiName: "${projectName}-api",
      description: "${className} API Gateway",
      deployOptions: {
        stageName: "v1",
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const integration = new apigateway.LambdaIntegration(this.handler);
    api.root.addProxy({ defaultIntegration: integration });

    return api;
  }

  private grantPermissions(): void {
    this.table.grantReadWriteData(this.handler);
    this.queue.grantSendMessages(this.handler);

    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
        resources: ["*"],
      }),
    );
  }

  private createOutputs(): void {
    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.api.url,
      description: "API Gateway URL",
    });

    new cdk.CfnOutput(this, "TableName", {
      value: this.table.tableName,
      description: "DynamoDB table name",
    });

    new cdk.CfnOutput(this, "QueueUrl", {
      value: this.queue.queueUrl,
      description: "SQS queue URL",
    });
  }
}
`;
}

function renderAppTs(projectName: string): string {
  const className = toPascalCase(projectName);

  return `#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ${className}Stack } from "../lib/stack";

const app = new cdk.App();

const env = {
  account: process.env["CDK_DEFAULT_ACCOUNT"],
  region: process.env["CDK_DEFAULT_REGION"] ?? "us-east-1",
};

new ${className}Stack(app, "${className}Stack", {
  env,
  description: "${className} infrastructure stack",
  tags: {
    project: "${projectName}",
    managedBy: "cdk",
  },
});

app.synth();
`;
}

function renderCdkJson(projectName: string): string {
  return `{
  "app": "npx ts-node --prefer-ts-exts bin/app.ts",
  "watch": {
    "include": ["**"],
    "exclude": [
      "README.md",
      "cdk*.json",
      "**/*.d.ts",
      "**/*.js",
      "tsconfig.json",
      "package*.json",
      "yarn.lock",
      "node_modules",
      "test"
    ]
  },
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/core:target-partitions": ["aws", "aws-cn"],
    "project:name": "${projectName}"
  }
}
`;
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

export const template: ITemplate = {
  name: "aws-cdk",
  type: TEMPLATE_TYPE.ADDON as TemplateType,
  description: "Generates AWS CDK infrastructure: Lambda, API Gateway, DynamoDB table, SQS queue, IAM roles",

  plan(feature: IFeatureSpec): IGeneratedFile[] {
    return [
      { path: "infra/cdk/lib/stack.ts", description: "CDK stack with Lambda, API Gateway, DynamoDB, SQS, IAM" },
      { path: "infra/cdk/bin/app.ts", description: "CDK app entry point" },
      { path: "infra/cdk/cdk.json", description: "CDK configuration" },
    ];
  },

  render(feature: IFeatureSpec, context: IGenerationContext): IRenderedFile[] {
    return [
      { path: "infra/cdk/lib/stack.ts", content: renderStackTs(context.projectName) },
      { path: "infra/cdk/bin/app.ts", content: renderAppTs(context.projectName) },
      { path: "infra/cdk/cdk.json", content: renderCdkJson(context.projectName) },
    ];
  },

  validate(files: IRenderedFile[]): IValidationResult {
    const errors: string[] = [];

    const requiredFiles = ["infra/cdk/lib/stack.ts", "infra/cdk/bin/app.ts", "infra/cdk/cdk.json"];
    for (const required of requiredFiles) {
      const found = files.find((f) => f.path === required);
      if (!found) {
        errors.push(`Missing required file: ${required}`);
      } else if (found.content.trim().length === 0) {
        errors.push(`File is empty: ${required}`);
      }
    }

    const stackTs = files.find((f) => f.path === "infra/cdk/lib/stack.ts");
    if (stackTs) {
      validateStackContent(stackTs.content, errors);
    }

    return { valid: errors.length === 0, errors };
  },
};

function validateStackContent(content: string, errors: string[]): void {
  const requiredImports = ["aws-cdk-lib", "aws-lambda", "aws-apigateway", "aws-dynamodb", "aws-sqs"];
  for (const imp of requiredImports) {
    if (!content.includes(imp)) {
      errors.push(`stack.ts missing required import: ${imp}`);
    }
  }
}
