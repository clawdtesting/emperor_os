import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requirementsPath = path.join(root, 'specs/execution-tier/requirements.v1.json');
const schemaPath = path.join(root, 'specs/execution-tier/requirements.schema.json');

const requirementsDoc = JSON.parse(fs.readFileSync(requirementsPath, 'utf8'));
const schemaDoc = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

function assertSchemaBasics(doc, schema) {
  for (const key of schema.required) {
    assert.ok(Object.hasOwn(doc, key), `Missing top-level key: ${key}`);
  }

  assert.ok(Array.isArray(doc.requirements) && doc.requirements.length > 0, 'requirements must be non-empty array');
  assert.ok(Array.isArray(doc.acceptanceTests) && doc.acceptanceTests.length > 0, 'acceptanceTests must be non-empty array');
}

function assertRequirementCoverage(doc) {
  const testsById = new Map(doc.acceptanceTests.map((test) => [test.id, test]));
  const mustLevels = new Set(['MUST', 'NEVER', 'ALWAYS']);

  for (const requirement of doc.requirements) {
    assert.ok(requirement.id, 'requirement.id is required');
    assert.ok(requirement.statement, `requirement.statement is required for ${requirement.id}`);
    assert.ok(requirement.machineCheck && typeof requirement.machineCheck === 'object', `machineCheck is required for ${requirement.id}`);

    if (mustLevels.has(requirement.normativeLevel)) {
      assert.ok(requirement.acceptanceTestId, `acceptanceTestId required for normative requirement ${requirement.id}`);
      assert.ok(
        testsById.has(requirement.acceptanceTestId),
        `Missing acceptance test ${requirement.acceptanceTestId} for normative requirement ${requirement.id}`
      );
    }
  }
}

function assertBidirectionalMapping(doc) {
  const requirementIds = new Set(doc.requirements.map((req) => req.id));

  for (const test of doc.acceptanceTests) {
    assert.ok(test.coversRequirementId, `coversRequirementId required for ${test.id}`);
    assert.ok(requirementIds.has(test.coversRequirementId), `Acceptance test ${test.id} references unknown requirement ${test.coversRequirementId}`);
  }
}

function assertCategoryCompleteness(doc) {
  const categories = new Set(doc.requirements.map((req) => req.category));
  const required = [
    'tier_policy',
    'apply_gate',
    'economics',
    'escalation',
    'artifacts',
    'non_negotiables'
  ];

  for (const category of required) {
    assert.ok(categories.has(category), `Required category missing from requirements: ${category}`);
  }
}

assertSchemaBasics(requirementsDoc, schemaDoc);
assertRequirementCoverage(requirementsDoc);
assertBidirectionalMapping(requirementsDoc);
assertCategoryCompleteness(requirementsDoc);

console.log('execution-tier requirements normalization checks passed');
