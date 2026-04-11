# Pipeline Flowchart — Standard Process Flow

## Diagram Type: Flowchart
Shows the complete pipeline process from PRD input to generated API output, including all decision points, retry logic, circuit breakers, and failure modes.

---

## 1. Mermaid

```mermaid
flowchart TB
    START([START: PRD File Input]) --> LOAD[Load .env + Config]
    LOAD --> DI[Create DI Container<br/>Register Agents + Factories]
    DI --> PLAN_CHECK{Plan Cached?}

    PLAN_CHECK -->|Cache Hit| LOAD_CACHE[Load TaskGraph<br/>from .plan-cache/]
    PLAN_CHECK -->|Cache Miss| PLAN_LLM[/"LLM: qwen3.5:27b<br/>Generate TaskGraph JSON"\]
    PLAN_LLM --> VALIDATE_DAG{Valid DAG?<br/>No cycles?}
    VALIDATE_DAG -->|Invalid| FAIL_PLAN([EXIT 1: Invalid Graph])
    VALIDATE_DAG -->|Valid| CACHE_PLAN[Write to .plan-cache/]
    CACHE_PLAN --> TOPO_SORT
    LOAD_CACHE --> TOPO_SORT

    TOPO_SORT[Topological Sort Tasks] --> TASK_LOOP

    subgraph TASK_LOOP["For Each Task (Dependency Order)"]
        NEXT_TASK[Get Next Task] --> SEED_KB[/"Read Knowledge Base<br/>docs/knowledge-bases/{id}.md"\]
        SEED_KB --> FIX_ENTRY[Enter Fix Loop]

        subgraph FIX["Fix Loop (max N iterations)"]
            FIX_ENTRY --> CODEGEN[/"LLM: CodeGen Agent<br/>Generate/Fix Code"\]
            CODEGEN --> BLOCKS_CHECK{Code Blocks<br/>Found?}
            BLOCKS_CHECK -->|No| RETRY[/"RETRY: Add suffix<br/>'MUST output code blocks'"\]
            RETRY --> BLOCKS_CHECK2{Blocks Now?}
            BLOCKS_CHECK2 -->|No| CODEGEN_FAIL[CodeGen Failed]
            BLOCKS_CHECK2 -->|Yes| SANITIZE
            BLOCKS_CHECK -->|Yes| SANITIZE

            SANITIZE["Sanitizer Pipeline<br/>1. Remove env.mts imports<br/>2. Fix async .resolve()<br/>3. Add .as('plugin')<br/>4. Static→await import()<br/>5. Strip type-only exports<br/>6. Fix barrel re-exports"]

            SANITIZE --> ESLINT[/"ESLint: Auto-fix"\]
            ESLINT --> IMPORT_VAL{Import/Export<br/>Validation}
            IMPORT_VAL -->|Errors| CB_CHECK1
            IMPORT_VAL -->|Pass| COPY_DEPS[Copy Shared Output<br/>to Task Code Dir]
            COPY_DEPS --> DEL_STALE[Delete Stale<br/>code/tests/*.test.mts]
            DEL_STALE --> MONGO[/"Docker: Ensure MongoDB<br/>mongo:latest port 27018"\]
            MONGO --> BUN_TEST[/"bun test: Real DB Tests"\]
            BUN_TEST --> TEST_PASS{Tests Pass?}
            TEST_PASS -->|Yes| WRITE_OUT[Write to Shared Output]
            TEST_PASS -->|No| CB_CHECK2

            CB_CHECK1{Circuit Breaker<br/>Same errors 5x?}
            CB_CHECK2{Circuit Breaker<br/>Same errors 5x?}
            CB_CHECK1 -->|No| NEXT_ITER{More Iters?}
            CB_CHECK2 -->|No| NEXT_ITER
            CB_CHECK1 -->|STUCK| CB_BREAK([CIRCUIT BREAK])
            CB_CHECK2 -->|STUCK| CB_BREAK
            NEXT_ITER -->|Yes| CODEGEN
            NEXT_ITER -->|No| EXHAUSTED([Exhausted])
        end

        WRITE_OUT --> TASK_DONE([TASK PASSED])

        subgraph FALLBACK["Fallback Tiers"]
            EXHAUSTED --> T2[/"Tier 2: GPT-5.4<br/>16 fresh iterations"\]
            CODEGEN_FAIL --> T2
            T2 --> T2_OK{Passed?}
            T2_OK -->|Yes| TASK_DONE2([PASSED via GPT-5.4])
            T2_OK -->|No| T3[/"Tier 3: Claude Sonnet 4.6<br/>16 fresh iterations"\]
            T3 --> T3_OK{Passed?}
            T3_OK -->|Yes| TASK_DONE3([PASSED via Sonnet])
            T3_OK -->|No| DIAG_ENTRY
        end

        subgraph DIAGNOSTIC["Diagnostic Mode"]
            CB_BREAK --> DIAG_ENTRY
            DIAG_ENTRY[Collect All Errors] --> DIAG_ASK[/"All Models: Analyze Root Cause"\]
            DIAG_ASK --> DIAG_SUMMARY[Summarize Solutions]
            DIAG_SUMMARY --> DIAG_FIX[/"30 cycles × each model<br/>with diagnosis context"\]
            DIAG_FIX --> DIAG_OK{Solved?}
            DIAG_OK -->|Yes| TASK_DONE4([PASSED via Diagnostic])
            DIAG_OK -->|No| HARD_FAIL([HARD FAILURE<br/>"Needs human help"])
        end

        TASK_DONE & TASK_DONE2 & TASK_DONE3 & TASK_DONE4 --> MORE{More Tasks?}
        MORE -->|Yes| NEXT_TASK
        MORE -->|No| CLEANUP
    end

    subgraph FINAL["Cleanup & Output"]
        CLEANUP[Stop MongoDB Docker] --> GEN_DOCS[/"LLM: Generate API Docs"\]
        GEN_DOCS --> RESULTS[Print Summary]
        RESULTS --> EXIT_CHECK{Failures?}
        EXIT_CHECK -->|None| EXIT_0([EXIT 0: All Passed])
        EXIT_CHECK -->|Some Failed| EXIT_1([EXIT 1: Partial])
        EXIT_CHECK -->|Hard Failure| EXIT_2([EXIT 2: Needs Human])
    end

    HARD_FAIL --> EXIT_2

    style HARD_FAIL fill:#dc3545,color:#fff,stroke:#dc3545
    style CB_BREAK fill:#fd7e14,color:#fff,stroke:#fd7e14
    style TASK_DONE fill:#28a745,color:#fff
    style TASK_DONE2 fill:#28a745,color:#fff
    style TASK_DONE3 fill:#28a745,color:#fff
    style TASK_DONE4 fill:#28a745,color:#fff
    style EXIT_0 fill:#28a745,color:#fff
    style EXIT_2 fill:#dc3545,color:#fff
    style DIAG_ENTRY fill:#fd7e14,color:#fff
```

---

## 2. Draw.io XML

```xml
<mxfile host="app.diagrams.net">
  <diagram name="Pipeline Flowchart" id="pipeline-flow">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <!-- Start -->
        <mxCell id="start" value="START: PRD File Input" style="ellipse;whiteSpace=wrap;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="300" y="20" width="200" height="60" as="geometry"/></mxCell>
        <!-- Load Env -->
        <mxCell id="load" value="Load .env + Config" style="rounded=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="300" y="100" width="200" height="40" as="geometry"/></mxCell>
        <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="start" target="load" parent="1"/>
        <!-- DI Container -->
        <mxCell id="di" value="Create DI Container&#xa;Register Agents + Factories" style="rounded=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="300" y="160" width="200" height="50" as="geometry"/></mxCell>
        <mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;" edge="1" source="load" target="di" parent="1"/>
        <!-- Plan Check -->
        <mxCell id="plancheck" value="Plan Cached?" style="rhombus;whiteSpace=wrap;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1"><mxGeometry x="325" y="230" width="150" height="80" as="geometry"/></mxCell>
        <mxCell id="e3" edge="1" source="di" target="plancheck" parent="1"/>
        <!-- Planning LLM -->
        <mxCell id="planlm" value="LLM: qwen3.5:27b&#xa;Generate TaskGraph" style="shape=parallelogram;whiteSpace=wrap;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1"><mxGeometry x="100" y="250" width="180" height="50" as="geometry"/></mxCell>
        <mxCell id="e4" value="No" edge="1" source="plancheck" target="planlm" parent="1"/>
        <!-- Cache Load -->
        <mxCell id="cacheload" value="Load from .plan-cache/" style="rounded=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1"><mxGeometry x="520" y="250" width="180" height="40" as="geometry"/></mxCell>
        <mxCell id="e5" value="Yes" edge="1" source="plancheck" target="cacheload" parent="1"/>
        <!-- Fix Loop Group -->
        <mxCell id="fixgroup" value="Fix Loop (per task)" style="swimlane;startSize=25;fillColor=#f5f5f5;strokeColor=#666666;fontColor=#333333;" vertex="1" parent="1"><mxGeometry x="50" y="400" width="700" height="350" as="geometry"/></mxCell>
        <!-- CodeGen -->
        <mxCell id="codegen" value="LLM: CodeGen Agent" style="shape=parallelogram;whiteSpace=wrap;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="fixgroup"><mxGeometry x="20" y="40" width="160" height="40" as="geometry"/></mxCell>
        <!-- Sanitizer -->
        <mxCell id="sanitize" value="Code Sanitizer&#xa;(6 auto-fix rules)" style="rounded=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="fixgroup"><mxGeometry x="200" y="40" width="160" height="40" as="geometry"/></mxCell>
        <!-- ESLint -->
        <mxCell id="eslint" value="ESLint Auto-fix" style="rounded=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="fixgroup"><mxGeometry x="380" y="40" width="120" height="40" as="geometry"/></mxCell>
        <!-- Validator -->
        <mxCell id="validator" value="Import/Export&#xa;Validator" style="rhombus;whiteSpace=wrap;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="fixgroup"><mxGeometry x="520" y="30" width="120" height="60" as="geometry"/></mxCell>
        <!-- Docker MongoDB -->
        <mxCell id="docker" value="Docker: MongoDB&#xa;port 27018" style="shape=cylinder3;whiteSpace=wrap;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="fixgroup"><mxGeometry x="200" y="120" width="120" height="60" as="geometry"/></mxCell>
        <!-- QA -->
        <mxCell id="qa" value="bun test&#xa;Real DB Tests" style="shape=parallelogram;whiteSpace=wrap;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="fixgroup"><mxGeometry x="350" y="130" width="140" height="40" as="geometry"/></mxCell>
        <!-- Circuit Breaker -->
        <mxCell id="cb" value="Circuit Breaker&#xa;Stuck 5x?" style="rhombus;whiteSpace=wrap;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="fixgroup"><mxGeometry x="520" y="120" width="130" height="60" as="geometry"/></mxCell>
        <!-- Pass -->
        <mxCell id="pass" value="TASK PASSED" style="ellipse;whiteSpace=wrap;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="fixgroup"><mxGeometry x="250" y="220" width="150" height="40" as="geometry"/></mxCell>
        <!-- Edges inside fix loop -->
        <mxCell id="ef1" edge="1" source="codegen" target="sanitize" parent="fixgroup"/>
        <mxCell id="ef2" edge="1" source="sanitize" target="eslint" parent="fixgroup"/>
        <mxCell id="ef3" edge="1" source="eslint" target="validator" parent="fixgroup"/>
        <mxCell id="ef4" edge="1" source="validator" target="docker" parent="fixgroup"><mxCell value="Pass"/></mxCell>
        <mxCell id="ef5" edge="1" source="docker" target="qa" parent="fixgroup"/>
        <mxCell id="ef6" edge="1" source="qa" target="cb" parent="fixgroup"><mxCell value="Fail"/></mxCell>
        <mxCell id="ef7" edge="1" source="qa" target="pass" parent="fixgroup"><mxCell value="Pass"/></mxCell>
        <!-- Fallback Group -->
        <mxCell id="fbgroup" value="Fallback Tiers" style="swimlane;startSize=25;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1"><mxGeometry x="50" y="780" width="700" height="120" as="geometry"/></mxCell>
        <mxCell id="t2" value="Tier 2: GPT-5.4&#xa;(16 iterations)" style="shape=parallelogram;whiteSpace=wrap;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="fbgroup"><mxGeometry x="20" y="35" width="180" height="50" as="geometry"/></mxCell>
        <mxCell id="t3" value="Tier 3: Claude Sonnet&#xa;(16 iterations)" style="shape=parallelogram;whiteSpace=wrap;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="fbgroup"><mxGeometry x="250" y="35" width="180" height="50" as="geometry"/></mxCell>
        <mxCell id="diag" value="Diagnostic Mode&#xa;(30 cycles × all models)" style="shape=parallelogram;whiteSpace=wrap;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="fbgroup"><mxGeometry x="480" y="35" width="190" height="50" as="geometry"/></mxCell>
        <!-- Hard Fail -->
        <mxCell id="hardfail" value="HARD FAILURE&#xa;Exit Code 2" style="ellipse;whiteSpace=wrap;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1"><mxGeometry x="530" y="930" width="180" height="60" as="geometry"/></mxCell>
        <!-- Success -->
        <mxCell id="success" value="EXIT 0: All Passed" style="ellipse;whiteSpace=wrap;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1"><mxGeometry x="100" y="930" width="180" height="60" as="geometry"/></mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

## 3. Lucidchart Structure

```json
{
  "title": "API Generator Pipeline Flowchart",
  "nodes": [
    {"id": "start", "label": "START: PRD File Input", "type": "terminator", "group": "entry"},
    {"id": "load_env", "label": "Load .env + Config", "type": "process", "group": "init"},
    {"id": "di_container", "label": "Create DI Container", "type": "process", "group": "init"},
    {"id": "plan_check", "label": "Plan Cached?", "type": "decision", "group": "planning"},
    {"id": "plan_llm", "label": "LLM: qwen3.5:27b Generate TaskGraph", "type": "llm_call", "group": "planning"},
    {"id": "load_cache", "label": "Load from .plan-cache/", "type": "data", "group": "planning"},
    {"id": "validate_dag", "label": "Valid DAG? No cycles?", "type": "decision", "group": "planning"},
    {"id": "topo_sort", "label": "Topological Sort Tasks", "type": "process", "group": "execution"},
    {"id": "seed_kb", "label": "Read Knowledge Base", "type": "data", "group": "fix_loop"},
    {"id": "codegen", "label": "LLM: CodeGen Agent", "type": "llm_call", "group": "fix_loop"},
    {"id": "code_check", "label": "Code Blocks Found?", "type": "decision", "group": "fix_loop"},
    {"id": "retry_codegen", "label": "RETRY: MUST output code blocks", "type": "llm_call", "group": "fix_loop"},
    {"id": "sanitizer", "label": "Code Sanitizer (6 rules)", "type": "process", "group": "fix_loop"},
    {"id": "eslint", "label": "ESLint Auto-fix", "type": "tool", "group": "fix_loop"},
    {"id": "import_val", "label": "Import/Export Validation", "type": "decision", "group": "fix_loop"},
    {"id": "docker_mongo", "label": "Docker: MongoDB 27018", "type": "infrastructure", "group": "fix_loop"},
    {"id": "bun_test", "label": "bun test: Real DB Tests", "type": "tool", "group": "fix_loop"},
    {"id": "test_pass", "label": "Tests Pass?", "type": "decision", "group": "fix_loop"},
    {"id": "circuit_breaker", "label": "Circuit Breaker: Same errors 5x?", "type": "decision", "group": "fix_loop"},
    {"id": "write_output", "label": "Write to Shared Output", "type": "data", "group": "fix_loop"},
    {"id": "task_passed", "label": "TASK PASSED", "type": "terminator_success", "group": "fix_loop"},
    {"id": "tier2_gpt", "label": "Tier 2: GPT-5.4 (16 iters)", "type": "llm_call", "group": "fallback"},
    {"id": "tier3_sonnet", "label": "Tier 3: Claude Sonnet (16 iters)", "type": "llm_call", "group": "fallback"},
    {"id": "diagnostic", "label": "Diagnostic Mode: All models analyze + fix", "type": "llm_call", "group": "diagnostic"},
    {"id": "hard_fail", "label": "HARD FAILURE: Needs human help", "type": "terminator_fail", "group": "diagnostic"},
    {"id": "cleanup", "label": "Stop MongoDB Docker", "type": "process", "group": "cleanup"},
    {"id": "exit_0", "label": "EXIT 0: All Passed", "type": "terminator_success", "group": "cleanup"},
    {"id": "exit_1", "label": "EXIT 1: Partial Failure", "type": "terminator_warn", "group": "cleanup"},
    {"id": "exit_2", "label": "EXIT 2: Hard Failure", "type": "terminator_fail", "group": "cleanup"}
  ],
  "edges": [
    {"from": "start", "to": "load_env", "label": ""},
    {"from": "load_env", "to": "di_container", "label": ""},
    {"from": "di_container", "to": "plan_check", "label": ""},
    {"from": "plan_check", "to": "load_cache", "label": "Cache Hit"},
    {"from": "plan_check", "to": "plan_llm", "label": "Cache Miss"},
    {"from": "plan_llm", "to": "validate_dag", "label": ""},
    {"from": "validate_dag", "to": "topo_sort", "label": "Valid"},
    {"from": "load_cache", "to": "topo_sort", "label": ""},
    {"from": "topo_sort", "to": "seed_kb", "label": "Per task"},
    {"from": "seed_kb", "to": "codegen", "label": ""},
    {"from": "codegen", "to": "code_check", "label": ""},
    {"from": "code_check", "to": "retry_codegen", "label": "No blocks"},
    {"from": "code_check", "to": "sanitizer", "label": "Has blocks"},
    {"from": "retry_codegen", "to": "sanitizer", "label": "Success"},
    {"from": "sanitizer", "to": "eslint", "label": ""},
    {"from": "eslint", "to": "import_val", "label": ""},
    {"from": "import_val", "to": "docker_mongo", "label": "Pass"},
    {"from": "import_val", "to": "circuit_breaker", "label": "Errors"},
    {"from": "docker_mongo", "to": "bun_test", "label": ""},
    {"from": "bun_test", "to": "test_pass", "label": ""},
    {"from": "test_pass", "to": "write_output", "label": "Pass"},
    {"from": "test_pass", "to": "circuit_breaker", "label": "Fail"},
    {"from": "circuit_breaker", "to": "codegen", "label": "Not stuck"},
    {"from": "circuit_breaker", "to": "diagnostic", "label": "STUCK 5x"},
    {"from": "write_output", "to": "task_passed", "label": ""},
    {"from": "tier2_gpt", "to": "task_passed", "label": "Success"},
    {"from": "tier2_gpt", "to": "tier3_sonnet", "label": "Failed"},
    {"from": "tier3_sonnet", "to": "task_passed", "label": "Success"},
    {"from": "tier3_sonnet", "to": "diagnostic", "label": "Failed"},
    {"from": "diagnostic", "to": "task_passed", "label": "Solved"},
    {"from": "diagnostic", "to": "hard_fail", "label": "All failed"},
    {"from": "hard_fail", "to": "exit_2", "label": ""},
    {"from": "cleanup", "to": "exit_0", "label": "No failures"},
    {"from": "cleanup", "to": "exit_1", "label": "Some failed"},
    {"from": "cleanup", "to": "exit_2", "label": "Hard failure"}
  ],
  "groups": [
    {"id": "entry", "label": "Entry"},
    {"id": "init", "label": "Initialization"},
    {"id": "planning", "label": "Phase 1: Planning"},
    {"id": "execution", "label": "Phase 2: Execution"},
    {"id": "fix_loop", "label": "Fix Loop"},
    {"id": "fallback", "label": "Fallback Tiers"},
    {"id": "diagnostic", "label": "Diagnostic Mode"},
    {"id": "cleanup", "label": "Phase 3: Cleanup"}
  ]
}
```

---

## 4. Visio Structure (CSV)

```csv
id,name,type,shape,group,connects_to,connection_label
start,START: PRD File Input,terminator,oval,Entry,load_env,
load_env,Load .env + Config,process,rectangle,Initialization,di_container,
di_container,Create DI Container,process,rectangle,Initialization,plan_check,
plan_check,Plan Cached?,decision,diamond,Planning,load_cache;plan_llm,Yes;No
plan_llm,LLM: qwen3.5:27b Generate TaskGraph,llm_call,parallelogram,Planning,validate_dag,
load_cache,Load from .plan-cache/,data,cylinder,Planning,topo_sort,
validate_dag,Valid DAG?,decision,diamond,Planning,topo_sort,Valid
topo_sort,Topological Sort Tasks,process,rectangle,Execution,seed_kb,Per task
seed_kb,Read Knowledge Base,data,document,Fix Loop,codegen,
codegen,LLM: CodeGen Agent,llm_call,parallelogram,Fix Loop,code_check,
code_check,Code Blocks Found?,decision,diamond,Fix Loop,sanitizer;retry_codegen,Yes;No
retry_codegen,RETRY with forced code instruction,llm_call,parallelogram,Fix Loop,sanitizer,
sanitizer,Code Sanitizer (6 rules),process,rectangle,Fix Loop,eslint,
eslint,ESLint Auto-fix,tool,rectangle,Fix Loop,import_val,
import_val,Import/Export Validation,decision,diamond,Fix Loop,docker_mongo;circuit_breaker,Pass;Errors
docker_mongo,Docker: MongoDB port 27018,infrastructure,cylinder,Fix Loop,bun_test,
bun_test,bun test: Real DB Tests,tool,parallelogram,Fix Loop,test_pass,
test_pass,Tests Pass?,decision,diamond,Fix Loop,write_output;circuit_breaker,Yes;No
circuit_breaker,Circuit Breaker: Same 5x?,decision,diamond,Fix Loop,codegen;diagnostic,Not stuck;STUCK
write_output,Write to Shared Output,data,cylinder,Fix Loop,task_passed,
task_passed,TASK PASSED,terminator,oval,Fix Loop,,
tier2_gpt,Tier 2: GPT-5.4 (16 iters),llm_call,parallelogram,Fallback,task_passed;tier3_sonnet,Pass;Fail
tier3_sonnet,Tier 3: Claude Sonnet (16 iters),llm_call,parallelogram,Fallback,task_passed;diagnostic,Pass;Fail
diagnostic,Diagnostic: All models analyze + fix (30 cycles),llm_call,parallelogram,Diagnostic,task_passed;hard_fail,Solved;Failed
hard_fail,HARD FAILURE: Needs human help,terminator,oval,Diagnostic,exit_2,
cleanup,Stop MongoDB Docker,process,rectangle,Cleanup,exit_0;exit_1;exit_2,
exit_0,EXIT 0: All Passed,terminator,oval,Cleanup,,
exit_1,EXIT 1: Partial Failure,terminator,oval,Cleanup,,
exit_2,EXIT 2: Hard Failure,terminator,oval,Cleanup,,
```

---

## 5. Explanation

This flowchart documents the complete lifecycle of a single pipeline run:

1. **Initialization**: Load environment, create DI container with all agents and fallback tiers
2. **Planning**: Check for cached plan, or generate via local LLM. Validate the DAG has no cycles.
3. **Task Execution**: Process each task in topological order through the fix loop
4. **Fix Loop**: CodeGen → Sanitize → ESLint → Validate → Docker MongoDB → bun test. Circuit breaker stops stuck loops after 5 stale iterations.
5. **Fallback**: If primary model fails, escalate through GPT-5.4 → Claude Sonnet → Diagnostic Mode
6. **Diagnostic**: Collect solutions from all models, then attempt fix with cross-model context. 30 cycles per model.
7. **Hard Failure**: If diagnostic can't solve it, exit with code 2 and message "needs human help"

## 6. Recommendations

- Consider adding a **parallel execution** lane for independent tasks that don't depend on each other
- Add a **cost estimator** node that tracks API spend across tiers
- Consider a **warm cache** for common code patterns that the sanitizer frequently fixes
