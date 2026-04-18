const CODEGEN_SYSTEM_PROMPT = await Bun.file(`${import.meta.dir}/md/codegen-system.md`).text();

export { CODEGEN_SYSTEM_PROMPT };
