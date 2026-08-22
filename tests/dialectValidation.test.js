const assert = require('assert');
try { require('dotenv').config(); } catch (e) { }
const { generateSentence, validateQuestion, FALLBACKS } = require('../data/generateSentence');

async function runTests() {
    console.log('🧪 Starting Quality Audit, Dialect & Semantic Coherence Tests...\n');

    // 1. Verify Fallback Questions Schema
    console.log('Test 1: Fallback questions schema & audit evidence');
    assert.strictEqual(Array.isArray(FALLBACKS), true, 'FALLBACKS should be an array');
    assert.strictEqual(FALLBACKS.length >= 8, true, 'At least 8 fallback questions should exist');

    for (const fb of FALLBACKS) {
        assert.ok(fb.questionId, `Fallback question must have questionId`);
        assert.ok(fb.sentence, `Fallback question must have sentence`);
        assert.ok(typeof fb.isCorrect === 'boolean', `isCorrect must be boolean`);
        assert.ok(fb.englishVariety, `Fallback must specify englishVariety`);
        assert.ok(fb.validationReasoning, `Fallback must specify validationReasoning`);
        assert.strictEqual(fb.isValidated, true, `Fallback must be marked isValidated: true`);
    }
    console.log('✅ Test 1 Passed: All fallbacks have valid questionId, englishVariety, and validationReasoning.\n');

    // 2. Dialect Ambiguity Audit Rejection Test
    console.log('Test 2: Dialect variation candidate rejection test');
    const dialectCandidate = {
        sentence: "They decided to stay at home at the weekend.",
        isCorrect: false,
        flawedPhrase: "at the weekend",
        correctPhrase: "on the weekend",
        correction: "They decided to stay at home on the weekend.",
        category: "Preposition Rules",
        hintText: "Check preposition usage.",
        englishVariety: "American English"
    };

    const auditDialect = await validateQuestion(dialectCandidate);
    assert.strictEqual(auditDialect.isValid, false, 'Candidate with dialect variation (at the weekend) MUST be rejected by audit layer');
    assert.strictEqual(auditDialect.dialectConflict, true, 'dialectConflict flag must be true for regional variations');
    console.log(`✅ Test 2 Passed: Dialect candidate correctly REJECTED: "${dialectCandidate.sentence}" (Reasoning: ${auditDialect.validationReasoning || auditDialect.rejectionReason})\n`);

    // 3. Semantic Coherence & Ambiguous Attachment Rejection Test
    console.log('Test 3: Semantic incoherence & ambiguous attachment rejection test');
    const incoherentCandidate = {
        sentence: "The teacher placed the music sheets at the table and the students on it.",
        isCorrect: false,
        flawedPhrase: "at the table and the students on it",
        correctPhrase: "on the table and handed the students theirs",
        correction: "The teacher placed the music sheets on the table and handed the students theirs.",
        category: "Preposition Rules",
        hintText: "Check object attachment.",
        englishVariety: "General / International English"
    };

    const auditIncoherent = await validateQuestion(incoherentCandidate);
    assert.strictEqual(auditIncoherent.isValid, false, 'Semantically ambiguous/incoherent candidate MUST be rejected by audit layer');
    assert.strictEqual(auditIncoherent.isSemanticallyCoherent, false, 'isSemanticallyCoherent flag must be false for incoherent sentences');
    console.log(`✅ Test 3 Passed: Incoherent candidate correctly REJECTED: "${incoherentCandidate.sentence}" (Reasoning: ${auditIncoherent.validationReasoning || auditIncoherent.rejectionReason})\n`);

    // 4. Unambiguous Error Audit Acceptance Test
    console.log('Test 4: Unambiguous error acceptance test');
    const clearErrorCandidate = {
        sentence: "She don't like eating vegetables for dinner.",
        isCorrect: false,
        flawedPhrase: "don't like",
        correctPhrase: "doesn't like",
        correction: "She doesn't like eating vegetables for dinner.",
        category: "Subject-Verb Agreement",
        hintText: "Check subject verb agreement for she.",
        englishVariety: "General / International English"
    };

    const auditClear = await validateQuestion(clearErrorCandidate);
    assert.strictEqual(auditClear.isValid, true, 'Unambiguous subject-verb error must be accepted by audit layer');
    console.log(`✅ Test 4 Passed: Unambiguous error ACCEPTED as valid test question. (Reasoning: ${auditClear.validationReasoning})\n`);

    // 5. False Error Claim Rejection Test
    console.log('Test 5: false plural-subject error claim rejection test');
    const falsePluralErrorCandidate = {
        sentence: "The teams are winning the championship because they are very skilled and talented.",
        isCorrect: false,
        flawedPhrase: "are winning",
        correctPhrase: "is winning",
        correction: "The teams is winning the championship because they are very skilled and talented.",
        category: "Plural Subject Agreement",
        hintText: "Check if the plural subject uses a singular or plural verb.",
        englishVariety: "General / International English"
    };

    const auditFalsePlural = await validateQuestion(falsePluralErrorCandidate);
    assert.strictEqual(auditFalsePlural.isValid, false, 'Valid plural-subject sentence must not be accepted as an incorrect lot');
    assert.strictEqual(auditFalsePlural.falseErrorClaim, true, 'falseErrorClaim flag must be true for unproven incorrect verdicts');
    console.log(`Test 5 Passed: False plural-subject error claim correctly REJECTED. (Reasoning: ${auditFalsePlural.validationReasoning})\n`);

    // 6. Plural Subject Structural Error Acceptance Test
    console.log('Test 6: real plural-subject structural error acceptance test');
    const realPluralErrorCandidate = {
        sentence: "The teams is winning the championship because they are very skilled and talented.",
        isCorrect: false,
        flawedPhrase: "teams is",
        correctPhrase: "teams are",
        correction: "The teams are winning the championship because they are very skilled and talented.",
        category: "Plural Subject Agreement",
        hintText: "Check if the plural subject uses a singular or plural verb.",
        englishVariety: "General / International English"
    };

    const auditRealPlural = await validateQuestion(realPluralErrorCandidate);
    assert.strictEqual(auditRealPlural.isValid, true, 'Real plural-subject agreement error must be accepted by audit layer');
    console.log(`Test 6 Passed: Real plural-subject error ACCEPTED as valid test question. (Reasoning: ${auditRealPlural.validationReasoning})\n`);

    // 7. Generate Sentence Integration Test
    console.log('Test 7: generateSentence function returns validated question object');
    const question = await generateSentence(false);
    assert.ok(question.questionId, 'Generated question must have questionId');
    assert.ok(question.sentence, 'Generated question must have sentence');
    assert.ok(question.englishVariety, 'Generated question must have englishVariety');
    assert.ok(question.validationReasoning, 'Generated question must have validationReasoning');
    assert.strictEqual(question.isValidated, true, 'Generated question must be marked isValidated');

    console.log(`Test 7 Passed: Generated question [${question.questionId} | ${question.englishVariety}]: "${question.sentence}"\n`);
    console.log('🎉 ALL QUALITY AUDIT, DIALECT & SEMANTIC COHERENCE TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
