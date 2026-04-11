export function renderDockerCompose(projectName: string): string {
  const dbName = toKebabCase(projectName);
  const containerName = `${dbName}-mongo`;

  return `services:
  mongodb:
    image: mongo:7
    container_name: ${containerName}
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    environment:
      MONGO_INITDB_DATABASE: ${dbName}
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mongo-data:
`;
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}
