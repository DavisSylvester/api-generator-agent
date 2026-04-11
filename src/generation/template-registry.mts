import type { IFeatureSpec, IRenderedFile, ITemplate } from "../core/interfaces/index.mts";
import {
  renderInterface,
  renderCreateDto,
  renderUpdateDto,
  renderInterfaceBarrel,
} from "../../templates/base/interface.tmpl.mts";
import {
  renderValidationSchema,
  renderSchemaBarrel,
} from "../../templates/base/schema.tmpl.mts";
import {
  renderRepository,
  renderRepositoryBarrel,
} from "../../templates/base/repository.tmpl.mts";
import {
  renderService,
  renderServiceInterface,
  renderServiceBarrel,
} from "../../templates/base/service.tmpl.mts";
import {
  renderRouter,
  renderRouterBarrel,
} from "../../templates/base/router.tmpl.mts";
import { renderSwaggerDetail } from "../../templates/base/swagger-detail.tmpl.mts";
import { renderServiceTest, renderIntegrationTest } from "../../templates/base/test.tmpl.mts";
import { renderContainer } from "../../templates/base/container.tmpl.mts";
import { renderServer } from "../../templates/base/server.tmpl.mts";
import { renderEnvConfig, renderDatabaseConfig, renderEnvExample } from "../../templates/base/env-config.tmpl.mts";
import { renderDockerCompose } from "../../templates/base/docker-compose.tmpl.mts";
import { renderHealthRouter } from "../../templates/base/health-router.tmpl.mts";
import { renderVersionRouter } from "../../templates/base/version-router.tmpl.mts";
import { renderTracePlugin } from "../../templates/base/trace-plugin.tmpl.mts";
import { renderLogger } from "../../templates/base/logger.tmpl.mts";
import { renderPackageJson } from "../../templates/base/package-json.tmpl.mts";
import { renderTsconfig } from "../../templates/base/tsconfig.tmpl.mts";
import { renderEslintConfig } from "../../templates/base/eslint-config.tmpl.mts";
import { renderGitignore } from "../../templates/base/gitignore.tmpl.mts";

export type TemplateLayer =
  | "interface"
  | "schema"
  | "repository"
  | "service"
  | "router"
  | "swagger"
  | "test"
  | "integration-test";

export class TemplateRegistry {

  private readonly addonTemplates: Map<string, ITemplate> = new Map();

  public registerAddon(template: ITemplate): void {
    this.addonTemplates.set(template.name, template);
  }

  public unregisterAddon(name: string): boolean {
    return this.addonTemplates.delete(name);
  }

  public getAddon(name: string): ITemplate | undefined {
    return this.addonTemplates.get(name);
  }

  public getRegisteredAddons(): ITemplate[] {
    return Array.from(this.addonTemplates.values());
  }

  public hasAddon(name: string): boolean {
    return this.addonTemplates.has(name);
  }

  public renderAddon(
    addonName: string,
    feature: IFeatureSpec,
    context: { projectName: string; outputDir: string; existingFiles: Map<string, string> },
  ): IRenderedFile[] {
    const addon = this.addonTemplates.get(addonName);
    if (!addon) {
      throw new Error(`Addon template not found: ${addonName}`);
    }
    return addon.render(feature, context);
  }

  public renderFeatureLayer(
    layer: TemplateLayer,
    feature: IFeatureSpec,
    integrationPort?: number,
  ): IRenderedFile[] {
    const files: IRenderedFile[] = [];

    for (const entity of feature.entities) {
      switch (layer) {
        case "interface":
          files.push(...this.renderInterfaces(entity, feature.domain));
          break;
        case "schema":
          files.push(...this.renderSchemas(entity, feature.domain));
          break;
        case "repository":
          files.push(...this.renderRepositories(entity, feature.domain));
          break;
        case "service":
          files.push(...this.renderServices(entity, feature.domain));
          break;
        case "router":
          files.push(...this.renderRouters(entity, feature.domain));
          break;
        case "swagger":
          files.push(...this.renderSwagger(entity, feature.domain));
          break;
        case "test":
          files.push(...this.renderTests(entity, feature.domain));
          break;
        case "integration-test":
          files.push(
            ...this.renderIntegrationTests(entity, feature.domain, integrationPort ?? 4100),
          );
          break;
      }
    }

    return files;
  }

  public renderInfrastructure(
    projectName: string,
    features: IFeatureSpec[],
  ): IRenderedFile[] {
    return [
      { path: "src/env.mts", content: renderEnvConfig(projectName) },
      { path: "src/ioc/create-database-configuration.mts", content: renderDatabaseConfig() },
      { path: "src/ioc/get-container.mts", content: renderContainer(projectName, features) },
      { path: "src/index.mts", content: renderServer(projectName, features) },
      { path: "src/loggers/logger.mts", content: renderLogger(projectName) },
      { path: "src/api/plugins/trace.plugin.mts", content: renderTracePlugin() },
      { path: "src/api/routes/health-router.mts", content: renderHealthRouter() },
      { path: "src/api/routes/version-router.mts", content: renderVersionRouter(projectName, "0.1.0") },
      { path: "package.json", content: renderPackageJson(projectName) },
      { path: "tsconfig.json", content: renderTsconfig(projectName) },
      { path: "eslint.config.mjs", content: renderEslintConfig() },
      { path: "docker-compose.yml", content: renderDockerCompose(projectName) },
      { path: ".env.example", content: renderEnvExample(projectName) },
      { path: ".gitignore", content: renderGitignore() },
    ];
  }

  private renderInterfaces(
    entity: { name: string; pluralName: string; fields: IFeatureSpec["entities"][0]["fields"]; relationships: IFeatureSpec["entities"][0]["relationships"]; operations: readonly string[] },
    domain: string,
  ): IRenderedFile[] {
    const kebab = toKebabCase(entity.name);
    const basePath = `src/features/${domain}/interfaces`;

    const mainResult = renderInterface(entity, domain);
    const mainContent = mainResult.split("|")[1] ?? mainResult;

    const createResult = renderCreateDto(entity, domain);
    const createContent = createResult.split("|")[1] ?? createResult;

    const updateResult = renderUpdateDto(entity, domain);
    const updateContent = updateResult.split("|")[1] ?? updateResult;

    return [
      { path: `${basePath}/i-${kebab}.mts`, content: mainContent },
      { path: `${basePath}/i-create-${kebab}.mts`, content: createContent },
      { path: `${basePath}/i-update-${kebab}.mts`, content: updateContent },
      { path: `${basePath}/index.mts`, content: renderInterfaceBarrel(entity) },
    ];
  }

  private renderSchemas(
    entity: { name: string; pluralName: string; fields: IFeatureSpec["entities"][0]["fields"]; relationships: IFeatureSpec["entities"][0]["relationships"]; operations: readonly string[] },
    domain: string,
  ): IRenderedFile[] {
    const kebab = toKebabCase(entity.name);
    const basePath = `src/features/${domain}/validation`;

    return [
      { path: `${basePath}/${kebab}.validation.mts`, content: renderValidationSchema(entity, domain) },
      { path: `${basePath}/index.mts`, content: renderSchemaBarrel(entity) },
    ];
  }

  private renderRepositories(
    entity: { name: string; pluralName: string; fields: IFeatureSpec["entities"][0]["fields"]; relationships: IFeatureSpec["entities"][0]["relationships"]; operations: readonly string[] },
    domain: string,
  ): IRenderedFile[] {
    const kebab = toKebabCase(entity.name);
    const basePath = `src/features/${domain}/repository`;

    return [
      { path: `${basePath}/${kebab}-repository.mts`, content: renderRepository(entity, domain) },
      { path: `${basePath}/index.mts`, content: renderRepositoryBarrel(entity) },
    ];
  }

  private renderServices(
    entity: { name: string; pluralName: string; fields: IFeatureSpec["entities"][0]["fields"]; relationships: IFeatureSpec["entities"][0]["relationships"]; operations: readonly string[] },
    domain: string,
  ): IRenderedFile[] {
    const kebab = toKebabCase(entity.name);
    const basePath = `src/features/${domain}/service`;

    return [
      { path: `${basePath}/${kebab}-service.mts`, content: renderService(entity, domain) },
      { path: `${basePath}/i-${kebab}-service.mts`, content: renderServiceInterface(entity, domain) },
      { path: `${basePath}/index.mts`, content: renderServiceBarrel(entity) },
    ];
  }

  private renderRouters(
    entity: { name: string; pluralName: string; fields: IFeatureSpec["entities"][0]["fields"]; relationships: IFeatureSpec["entities"][0]["relationships"]; operations: readonly string[] },
    domain: string,
  ): IRenderedFile[] {
    const pluralKebab = toKebabCase(entity.pluralName);
    const basePath = `src/features/${domain}/router`;

    return [
      { path: `${basePath}/${pluralKebab}-router.mts`, content: renderRouter(entity, domain) },
      { path: `${basePath}/index.mts`, content: renderRouterBarrel(entity) },
    ];
  }

  private renderSwagger(
    entity: { name: string; pluralName: string; fields: IFeatureSpec["entities"][0]["fields"]; relationships: IFeatureSpec["entities"][0]["relationships"]; operations: readonly string[] },
    domain: string,
  ): IRenderedFile[] {
    const kebab = toKebabCase(entity.name);
    const basePath = `src/features/${domain}/docs`;

    return [
      { path: `${basePath}/${kebab}-swagger.mts`, content: renderSwaggerDetail(entity, domain) },
    ];
  }

  private renderTests(
    entity: { name: string; pluralName: string; fields: IFeatureSpec["entities"][0]["fields"]; relationships: IFeatureSpec["entities"][0]["relationships"]; operations: readonly string[] },
    domain: string,
  ): IRenderedFile[] {
    const kebab = toKebabCase(entity.name);

    return [
      { path: `tests/${domain}/${kebab}-service.test.mts`, content: renderServiceTest(entity, domain) },
    ];
  }

  private renderIntegrationTests(
    entity: { name: string; pluralName: string; fields: IFeatureSpec["entities"][0]["fields"]; relationships: IFeatureSpec["entities"][0]["relationships"]; operations: readonly string[] },
    domain: string,
    port: number,
  ): IRenderedFile[] {
    const kebab = toKebabCase(entity.name);

    return [
      {
        path: `tests/__tests__/${kebab}.integration.test.mts`,
        content: renderIntegrationTest(entity, domain, port),
      },
    ];
  }
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}
