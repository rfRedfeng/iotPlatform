# Data Processing Pipeline - Task List

## Status Legend
- [ ] Not started
- [x] Completed
- [ ] In progress

## Phase 1: Parsers + Time-Series Ingestion
- [ ] Task 1: JsonParser (`data-processing/parsers/JsonParser.js`)
- [ ] Task 2: BinaryParser (`data-processing/parsers/BinaryParser.js`)
- [ ] Task 3: DataIngestor (`data-processing/time-series/DataIngestor.js`)

## Phase 2: Alert Engine
- [ ] Task 4: RuleEvaluator (`data-processing/alert-engine/RuleEvaluator.js`)
- [ ] Task 5: AlertLogger (`data-processing/alert-engine/AlertLogger.js`)

## Phase 3: Protocol Adapters
- [ ] Task 6: MqttAdapter (`data-processing/protocol-adapters/MqttAdapter.js`)
- [ ] Task 7: TcpAdapter (`data-processing/protocol-adapters/TcpAdapter.js`)

## Phase 4: Pipeline Core
- [ ] Task 8: DataPipeline (`data-processing/DataPipeline.js`)

---

## Completed
- [x] DeviceCache (`data-processing/cache/DeviceCache.js`)
- [x] MetricCache (`data-processing/cache/MetricCache.js`)
- [x] AlertCache (`data-processing/cache/AlertCache.js`)

---

## Dependency Graph

```
JsonParser
    │
    └── BinaryParser
            │
            └── DataIngestor
                    │
                    └── RuleEvaluator
                            │
                            └── AlertLogger
                                    │
                                    └── DataPipeline
                                            
MqttAdapter ──► DataPipeline
TcpAdapter  ──► DataPipeline
```