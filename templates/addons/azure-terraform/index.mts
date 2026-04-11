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

function renderMainTf(projectName: string, features: IFeatureSpec): string {
  const resourceGroupName = `rg-${projectName}`;
  const appName = projectName;

  return `terraform {
  required_version = ">= 1.5.0"
}

resource "azurerm_resource_group" "main" {
  name     = "\${var.project_name}-\${var.environment}-rg"
  location = var.location

  tags = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

resource "azurerm_service_plan" "main" {
  name                = "\${var.project_name}-\${var.environment}-plan"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "B1"

  tags = azurerm_resource_group.main.tags
}

resource "azurerm_linux_web_app" "main" {
  name                = "\${var.project_name}-\${var.environment}-app"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.main.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      node_version = "20-lts"
    }
    always_on = true
  }

  app_settings = {
    "WEBSITE_NODE_DEFAULT_VERSION" = "~20"
    "NODE_ENV"                     = var.environment
  }

  tags = azurerm_resource_group.main.tags
}

resource "azurerm_key_vault" "main" {
  name                = "\${var.project_name}-\${var.environment}-kv"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  purge_protection_enabled   = false
  soft_delete_retention_days = 7

  tags = azurerm_resource_group.main.tags
}

resource "azurerm_key_vault_access_policy" "app" {
  key_vault_id = azurerm_key_vault.main.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_linux_web_app.main.identity[0].principal_id

  secret_permissions = [
    "Get",
    "List",
  ]
}

data "azurerm_client_config" "current" {}

resource "azurerm_storage_account" "queue" {
  name                     = "\${replace(var.project_name, "-", "")}\${var.environment}sa"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"

  tags = azurerm_resource_group.main.tags
}

resource "azurerm_storage_queue" "messages" {
  name                 = "\${var.project_name}-messages"
  storage_account_name = azurerm_storage_account.queue.name
}

resource "azurerm_service_plan" "functions" {
  name                = "\${var.project_name}-\${var.environment}-func-plan"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "Y1"

  tags = azurerm_resource_group.main.tags
}

resource "azurerm_linux_function_app" "queue_consumer" {
  name                = "\${var.project_name}-\${var.environment}-queue-func"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.functions.id

  storage_account_name       = azurerm_storage_account.queue.name
  storage_account_access_key = azurerm_storage_account.queue.primary_access_key

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      node_version = "20"
    }
  }

  tags = azurerm_resource_group.main.tags
}

resource "azurerm_linux_function_app" "timer_job" {
  name                = "\${var.project_name}-\${var.environment}-timer-func"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.functions.id

  storage_account_name       = azurerm_storage_account.queue.name
  storage_account_access_key = azurerm_storage_account.queue.primary_access_key

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      node_version = "20"
    }
  }

  app_settings = {
    "TIMER_SCHEDULE" = "0 */5 * * * *"
  }

  tags = azurerm_resource_group.main.tags
}
`;
}

function renderVariablesTf(): string {
  return `variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "eastus2"
}
`;
}

function renderOutputsTf(): string {
  return `output "web_app_url" {
  description = "URL of the deployed web application"
  value       = "https://\${azurerm_linux_web_app.main.default_hostname}"
}

output "key_vault_uri" {
  description = "URI of the Azure Key Vault"
  value       = azurerm_key_vault.main.vault_uri
}

output "storage_queue_name" {
  description = "Name of the Azure Storage Queue"
  value       = azurerm_storage_queue.messages.name
}

output "queue_function_name" {
  description = "Name of the queue consumer function app"
  value       = azurerm_linux_function_app.queue_consumer.name
}

output "timer_function_name" {
  description = "Name of the timer job function app"
  value       = azurerm_linux_function_app.timer_job.name
}
`;
}

function renderProvidersTf(): string {
  return `terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80"
    }
  }

  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "tfstatestore"
    container_name       = "tfstate"
    key                  = "terraform.tfstate"
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy = true
    }
  }
}
`;
}

export const template: ITemplate = {
  name: "azure-terraform",
  type: TEMPLATE_TYPE.ADDON as TemplateType,
  description: "Generates Azure Terraform infrastructure: Resource Group, App Service, KeyVault, managed identity, queue consumer, and timer job resources",

  plan(feature: IFeatureSpec): IGeneratedFile[] {
    return [
      { path: "infra/main.tf", description: "Resource group, App Service Plan, Linux Web App, KeyVault, managed identity, queue consumer, timer job" },
      { path: "infra/variables.tf", description: "Project name, environment, location variables" },
      { path: "infra/outputs.tf", description: "Web app URL, KeyVault URI outputs" },
      { path: "infra/providers.tf", description: "AzureRM provider configuration" },
    ];
  },

  render(feature: IFeatureSpec, context: IGenerationContext): IRenderedFile[] {
    return [
      { path: "infra/main.tf", content: renderMainTf(context.projectName, feature) },
      { path: "infra/variables.tf", content: renderVariablesTf() },
      { path: "infra/outputs.tf", content: renderOutputsTf() },
      { path: "infra/providers.tf", content: renderProvidersTf() },
    ];
  },

  validate(files: IRenderedFile[]): IValidationResult {
    const errors: string[] = [];

    const requiredFiles = ["infra/main.tf", "infra/variables.tf", "infra/outputs.tf", "infra/providers.tf"];
    for (const required of requiredFiles) {
      const found = files.find((f) => f.path === required);
      if (!found) {
        errors.push(`Missing required file: ${required}`);
      } else if (found.content.trim().length === 0) {
        errors.push(`File is empty: ${required}`);
      }
    }

    const mainTf = files.find((f) => f.path === "infra/main.tf");
    if (mainTf) {
      validateMainTfContent(mainTf.content, errors);
    }

    return { valid: errors.length === 0, errors };
  },
};

function validateMainTfContent(content: string, errors: string[]): void {
  const requiredResources = [
    "azurerm_resource_group",
    "azurerm_service_plan",
    "azurerm_linux_web_app",
    "azurerm_key_vault",
  ];
  for (const resource of requiredResources) {
    if (!content.includes(resource)) {
      errors.push(`main.tf missing required resource: ${resource}`);
    }
  }
}
