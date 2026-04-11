export interface IFieldSpec {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
  validation?: string;
}

export interface IRelationship {
  targetEntity: string;
  type: "one-to-one" | "one-to-many" | "many-to-many";
  foreignKey: string;
  required: boolean;
}

export interface IEntitySpec {
  name: string;
  pluralName: string;
  fields: IFieldSpec[];
  relationships: IRelationship[];
  operations: readonly string[];
}

export interface IFeatureSpec {
  name: string;
  domain: string;
  description: string;
  entities: IEntitySpec[];
  dependsOn: string[];
}
