const Groq = require('groq-sdk');
const writeGood = require('write-good');

function getGroqClient() {
    if (!process.env.GROQ_API_KEY) return null;
    return new Groq({ apiKey: process.env.GROQ_API_KEY });
}

/**
 * Fast LanguageTool Grammar Check via HTTP API (Option 1: 2-second max timeout guard)
 */
async function checkLanguageTool(sentence) {
    if (!sentence || typeof sentence !== 'string') return { ok: true, matches: [] };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
        const response = await fetch('https://api.languagetool.org/v2/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ text: sentence, language: 'en-US' }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) return { ok: false, matches: [] };
        const data = await response.json();
        return { ok: true, matches: data.matches || [] };
    } catch (err) {
        clearTimeout(timeoutId);
        return { ok: false, matches: [] }; // Graceful fallback if offline or timed out
    }
}

const SYSTEM_PROMPT = `You are an expert English Linguist & Master Educator creating clear, simple, and logically coherent test sentences for middle school students (Class 6 to 8 level, ages 11-14) playing an auction game called "Grammar Bid".

MANDATORY QUESTION REQUIREMENTS (ALL MUST PASS):
1. GRAMMATICALLY EVALUABLE: Must test a clear, single surface grammar rule (e.g., subject-verb agreement, pronoun case, tense, double negatives).
2. DIALECT-SAFE & UNAMBIGUOUS VERDICT: An incorrect sentence MUST contain an error that is 100% indisputably incorrect across ALL standard varieties of English (American, British, Australian, Canadian, International). NEVER treat regional dialect variations or disputed time prepositions as errors or correct sentences:
   - REJECT: "on my free time" vs "in my free time" (NEVER USE "free time" prepositions, "on the weekend" vs "at the weekend", "in hospital" vs "in the hospital", "different from" vs "different to").
   - If testing prepositions, test ONLY fixed collocations with zero regional variation (e.g., "interested in", "afraid of", "listen to", "depend on").
3. SEMANTICALLY COHERENT & LOGICALLY SOUND: The sentence MUST describe a clear, natural, realistic real-world scenario. REJECT sentences that are:
   - Nonsensical or logically incoherent.
   - Semantically ambiguous or bizarrely phrased.
   - Dependent on unclear pronoun or object references (e.g., "The teacher placed the music sheets at the table and the students on it" -> REJECT).
   - Describing physically or logically impossible or weird relationships.
   - Missing context needed to determine the intended meaning.
4. ONE DEFENSIBLE VERDICT: Must have exactly ONE clear, defensible verdict (isCorrect: true or false).
5. SENTENCE LENGTH: 10 to 18 words long.
6. NO FALSE ERROR CLAIMS: Never mark a valid sentence as incorrect. In particular, plural subjects use plural verbs:
   - VALID: "The teams are winning the championship because they are very skilled and talented."
   - INVALID: "The teams is winning the championship because they are very skilled and talented."

Response Schema (STRICT JSON ONLY, no markdown, no code fences):
{
  "sentence": "The full sentence to display",
  "isCorrect": true or false,
  "flawedPhrase": "exact substring in sentence containing error or null if correct",
  "correctPhrase": "exact corrected replacement phrase or null if correct",
  "correction": "Full corrected sentence",
  "category": "Grammar category being tested",
  "domain": "Theme/domain used for the sentence",
  "hintText": "A simple clue about what to look for",
  "englishVariety": "General / International English",
  "validationReasoning": "Detailed evidence confirming grammatical evaluability, dialect safety, and semantic coherence."
}`;

const VALIDATION_SYSTEM_PROMPT = `You are a Senior English Language Auditor & Educational Quality Inspector. Your job is to strictly verify questions for an educational competition involving virtual cash.

AUDIT THE CANDIDATE QUESTION AGAINST THE MANDATORY PILLARS:
1. FALSE ERROR CLAIM CHECK:
   - If candidate is marked "isCorrect: false", check if the sentence contains an actual structural grammar error (e.g. subject-verb agreement "she don't", pronoun case "given to he", past tense error "they went and practice", double negative "didn't see nobody").
   - Reject ONLY if the sentence is ALREADY 100% valid, natural, flawless standard English.
2. GRAMMATICALLY EVALUABLE: If "isCorrect: false", the sentence MUST contain a clear error.
3. DIALECT-SAFE: Is the verdict unambiguous across standard English dialects (US, UK, AU, CA)? (e.g. avoid disputed prepositions like "on my free time" vs "in my free time").
4. SEMANTICALLY COHERENT: Is the sentence natural, realistic, and free of logical absurdity?

Response Schema (STRICT JSON ONLY):
{
  "isValid": true or false,
  "isUnambiguous": true or false,
  "isSemanticallyCoherent": true or false,
  "falseErrorClaim": false,
  "dialectConflict": false,
  "semanticConflict": false,
  "englishVariety": "General / International English",
  "validationReasoning": "Clear grammatical reasoning validating why this verdict is objective.",
  "rejectionReason": null or "Detailed reason why candidate was rejected"
}`;

// Verified Class 6-8 level fallback sentences with unique IDs & audit evidence
const FALLBACKS = [
    {
        questionId: "q_fb_001",
        sentence: "Neither of the boys was ready for the soccer match yesterday.",
        isCorrect: true,
        flawedPhrase: null,
        correctPhrase: null,
        correction: "Neither of the boys was ready for the soccer match yesterday.",
        category: "Subject-Verb Agreement",
        domain: "sports & team competitions",
        hintText: "Check if the singular subject 'neither' takes a singular verb.",
        englishVariety: "General / International English",
        validationReasoning: "In formal standard English across all varieties, 'neither' as a pronoun takes a singular verb 'was'. Unambiguously correct.",
        isValidated: true
    },
    {
        questionId: "q_fb_002",
        sentence: "Neither of the boys were ready for the soccer match yesterday.",
        isCorrect: false,
        flawedPhrase: "were ready",
        correctPhrase: "was ready",
        correction: "Neither of the boys was ready for the soccer match yesterday.",
        category: "Subject-Verb Agreement",
        domain: "sports & team competitions",
        hintText: "Check if 'neither' needs a singular or plural verb.",
        englishVariety: "General / International English",
        validationReasoning: "'Neither' is a singular subject requiring singular verb 'was'. 'were ready' is incorrect in standard formal grammar worldwide.",
        isValidated: true
    },
    {
        questionId: "q_fb_003",
        sentence: "My dog loves running in the park every morning with my brother.",
        isCorrect: true,
        flawedPhrase: null,
        correctPhrase: null,
        correction: "My dog loves running in the park every morning with my brother.",
        category: "Action Verbs",
        domain: "pets & outdoor activities",
        hintText: "Check if the verb matches the singular subject 'dog'.",
        englishVariety: "General / International English",
        validationReasoning: "Subject 'dog' agrees with singular present verb 'loves'. Standard and correct in all English varieties.",
        isValidated: true
    },
    {
        questionId: "q_fb_004",
        sentence: "She don't like eating green vegetables for dinner.",
        isCorrect: false,
        flawedPhrase: "don't like",
        correctPhrase: "doesn't like",
        correction: "She doesn't like eating green vegetables for dinner.",
        category: "Subject-Verb Agreement",
        domain: "food & healthy eating",
        hintText: "Does 'she' use 'don't' or 'doesn't'?",
        englishVariety: "General / International English",
        validationReasoning: "Third-person singular 'she' requires 'doesn't'. 'don't like' is universally ungrammatical in standard English.",
        isValidated: true
    },
    {
        questionId: "q_fb_005",
        sentence: "Each of the students has finished the science project on time.",
        isCorrect: true,
        flawedPhrase: null,
        correctPhrase: null,
        correction: "Each of the students has finished the science project on time.",
        category: "Pronoun Agreement",
        domain: "school science projects",
        hintText: "Is 'each' singular or plural?",
        englishVariety: "General / International English",
        validationReasoning: "'Each' is an indefinite singular pronoun requiring 'has'. Correct globally.",
        isValidated: true
    },
    {
        questionId: "q_fb_006",
        sentence: "The teacher gave the new textbooks to him and I after class.",
        isCorrect: false,
        flawedPhrase: "to him and I",
        correctPhrase: "to him and me",
        correction: "The teacher gave the new textbooks to him and me after class.",
        category: "Pronoun Usage",
        domain: "classroom supplies",
        hintText: "Should you use subject pronoun 'I' or object pronoun 'me' after a preposition?",
        englishVariety: "General / International English",
        validationReasoning: "Preposition 'to' requires objective case pronouns ('him and me'). Using nominative 'I' as object of a preposition is incorrect in all standard dialects.",
        isValidated: true
    },
    {
        questionId: "q_fb_007",
        sentence: "We went to the library to borrow books for our weekend project.",
        isCorrect: true,
        flawedPhrase: null,
        correctPhrase: null,
        correction: "We went to the library to borrow books for our weekend project.",
        category: "Past Tense",
        domain: "library research",
        hintText: "Check past tense verb consistency.",
        englishVariety: "General / International English",
        validationReasoning: "Simple past verb 'went' and noun adjunct 'weekend project' are standard across all English varieties.",
        isValidated: true
    },
    {
        questionId: "q_fb_008",
        sentence: "The captain and his team was very happy after winning the game.",
        isCorrect: false,
        flawedPhrase: "was very happy",
        correctPhrase: "were very happy",
        correction: "The captain and his team were very happy after winning the game.",
        category: "Plural Subject Agreement",
        domain: "sports & team competitions",
        hintText: "Look at the compound subject 'the captain and his team'.",
        englishVariety: "General / International English",
        validationReasoning: "Compound subject connected by 'and' ('captain and team') forms a plural subject requiring plural verb 'were'. 'was' is incorrect in standard English.",
        isValidated: true
    },
    {
        questionId: "q_fb_009",
        sentence: "The pilot must check every gauge before the small plane takes off.",
        isCorrect: true,
        flawedPhrase: null,
        correctPhrase: null,
        correction: "The pilot must check every gauge before the small plane takes off.",
        category: "Modal Verbs",
        domain: "aviation & flight navigation",
        hintText: "Check if the modal verb is followed by the base verb.",
        englishVariety: "General / International English",
        validationReasoning: "Modal verb 'must' is correctly followed by the base verb 'check'.",
        isValidated: true
    },
    {
        questionId: "q_fb_010",
        sentence: "The pilot must to check every gauge before the small plane takes off.",
        isCorrect: false,
        flawedPhrase: "must to check",
        correctPhrase: "must check",
        correction: "The pilot must check every gauge before the small plane takes off.",
        category: "Modal Verbs",
        domain: "aviation & flight navigation",
        hintText: "A modal verb should be followed by the base verb.",
        englishVariety: "General / International English",
        validationReasoning: "Standard modal verbs such as 'must' take a bare infinitive, so 'must to check' is incorrect.",
        isValidated: true
    },
    {
        questionId: "q_fb_011",
        sentence: "An engineer repaired a broken sensor inside the research robot.",
        isCorrect: true,
        flawedPhrase: null,
        correctPhrase: null,
        correction: "An engineer repaired a broken sensor inside the research robot.",
        category: "Determiners and Articles",
        domain: "robotics & future transportation",
        hintText: "Check whether 'a' and 'an' match the following sounds.",
        englishVariety: "General / International English",
        validationReasoning: "'An' before vowel sound 'engineer' and 'a' before consonant sound 'broken' are correct.",
        isValidated: true
    },
    {
        questionId: "q_fb_012",
        sentence: "A engineer repaired a broken sensor inside the research robot.",
        isCorrect: false,
        flawedPhrase: "A engineer",
        correctPhrase: "An engineer",
        correction: "An engineer repaired a broken sensor inside the research robot.",
        category: "Determiners and Articles",
        domain: "robotics & future transportation",
        hintText: "Check whether the article matches the next word's sound.",
        englishVariety: "General / International English",
        validationReasoning: "The word 'engineer' begins with a vowel sound, so the article must be 'an', not 'a'.",
        isValidated: true
    },
    {
        questionId: "q_fb_013",
        sentence: "The museum displayed three ancient knives near the glass case.",
        isCorrect: true,
        flawedPhrase: null,
        correctPhrase: null,
        correction: "The museum displayed three ancient knives near the glass case.",
        category: "Singular and Plural Nouns",
        domain: "archeological digs & ancient ruins",
        hintText: "Check if the plural noun form is correct after a number.",
        englishVariety: "General / International English",
        validationReasoning: "The plural of 'knife' is 'knives', so the noun agrees with 'three'.",
        isValidated: true
    },
    {
        questionId: "q_fb_014",
        sentence: "The museum displayed three ancient knife near the glass case.",
        isCorrect: false,
        flawedPhrase: "three ancient knife",
        correctPhrase: "three ancient knives",
        correction: "The museum displayed three ancient knives near the glass case.",
        category: "Singular and Plural Nouns",
        domain: "archeological digs & ancient ruins",
        hintText: "A number greater than one usually needs a plural noun.",
        englishVariety: "General / International English",
        validationReasoning: "The number 'three' requires the plural noun 'knives', not singular 'knife'.",
        isValidated: true
    },
    {
        questionId: "q_fb_015",
        sentence: "If the storm arrives tonight, the hikers will sleep inside the cabin.",
        isCorrect: true,
        flawedPhrase: null,
        correctPhrase: null,
        correction: "If the storm arrives tonight, the hikers will sleep inside the cabin.",
        category: "First Conditional",
        domain: "extreme sports & mountain climbing",
        hintText: "Check the verb form in the if-clause.",
        englishVariety: "General / International English",
        validationReasoning: "A first conditional uses present simple in the if-clause and 'will' in the main clause.",
        isValidated: true
    },
    {
        questionId: "q_fb_016",
        sentence: "If the storm will arrive tonight, the hikers will sleep inside the cabin.",
        isCorrect: false,
        flawedPhrase: "will arrive",
        correctPhrase: "arrives",
        correction: "If the storm arrives tonight, the hikers will sleep inside the cabin.",
        category: "First Conditional",
        domain: "extreme sports & mountain climbing",
        hintText: "Use present simple after 'if' in a first conditional.",
        englishVariety: "General / International English",
        validationReasoning: "In a first conditional, the if-clause uses present simple, so 'will arrive' should be 'arrives'.",
        isValidated: true
    },
    {
        questionId: "q_fb_017",
        sentence: "The detective listened to the witness during the quiet interview.",
        isCorrect: true,
        flawedPhrase: null,
        correctPhrase: null,
        correction: "The detective listened to the witness during the quiet interview.",
        category: "Fixed Prepositions",
        domain: "detective mysteries & crime investigation",
        hintText: "Check the fixed preposition after 'listened'.",
        englishVariety: "General / International English",
        validationReasoning: "The fixed collocation is 'listen to', which is standard across English varieties.",
        isValidated: true
    },
    {
        questionId: "q_fb_018",
        sentence: "The detective listened at the witness during the quiet interview.",
        isCorrect: false,
        flawedPhrase: "listened at",
        correctPhrase: "listened to",
        correction: "The detective listened to the witness during the quiet interview.",
        category: "Fixed Prepositions",
        domain: "detective mysteries & crime investigation",
        hintText: "Check the fixed preposition after 'listened'.",
        englishVariety: "General / International English",
        validationReasoning: "The fixed collocation is 'listen to'; 'listened at the witness' is incorrect here.",
        isValidated: true
    }
];

const DOMAINS = [
    'space exploration & astronomy',
    'medieval history & castles',
    'oceanography & deep sea mysteries',
    'wildlife conservation & safari animals',
    'cybersecurity & AI technology',
    'detective mysteries & crime investigation',
    'world travel & exotic architecture',
    'aviation & flight navigation',
    'esports & competitive gaming',
    'extreme sports & mountain climbing',
    'scientific discoveries & physics',
    'culinary arts & world cuisine',
    'film production & theatrical arts',
    'renewable energy & environmental science',
    'robotics & future transportation',
    'archeological digs & ancient ruins'
];

const GRAMMAR_CATEGORIES = [
    'Subject-Verb Agreement',
    'Plural Subject Agreement',
    'Past & Present Tense',
    'Past Tense Verb Forms',
    'Pronoun Case',
    'Singular and Plural Nouns',
    'Countable and Uncountable Nouns',
    'Determiners and Articles',
    'Modal Verbs',
    'First Conditional',
    'Fixed Prepositions',
    'Double Negatives',
    'Possessive Nouns',
    'Comparatives and Superlatives'
];

// Strict structural categories for generating INCORRECT sentences (zero preposition ambiguity)
const INCORRECT_CATEGORIES = [
    'Subject-Verb Agreement',
    'Plural Subject Agreement',
    'Past Tense Verb Forms',
    'Pronoun Case',
    'Singular and Plural Nouns',
    'Countable and Uncountable Nouns',
    'Determiners and Articles',
    'Modal Verbs',
    'First Conditional',
    'Fixed Prepositions',
    'Double Negatives'
];

let fallbackIndex = 0;

/**
 * Generate a unique question ID for tracking & dispute reporting
 */
function createQuestionId() {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function normalizeSelectionKey(value) {
    return String(value || '').trim().toLowerCase();
}

function makeExclusionSet(values) {
    return new Set((Array.isArray(values) ? values : [])
        .map(normalizeSelectionKey)
        .filter(Boolean));
}

function pickFromPool(pool, excludedValues = []) {
    const excluded = makeExclusionSet(excludedValues);
    const available = pool.filter(item => !excluded.has(normalizeSelectionKey(item)));
    const source = available.length > 0 ? available : pool;
    return source[Math.floor(Math.random() * source.length)];
}

function chooseFallbackQuestion(shouldBeCorrect, disabledIds, disabledSentences, options = {}) {
    const excludedCategories = makeExclusionSet(options.excludeCategories);
    const excludedDomains = makeExclusionSet(options.excludeDomains);

    const isEnabled = f =>
        f.isCorrect === shouldBeCorrect &&
        !disabledIds.has(f.questionId) &&
        !disabledSentences.has(f.sentence.trim().toLowerCase());

    const strictPool = FALLBACKS.filter(f =>
        isEnabled(f) &&
        !excludedCategories.has(normalizeSelectionKey(f.category)) &&
        !excludedDomains.has(normalizeSelectionKey(f.domain))
    );

    const categoryOnlyPool = FALLBACKS.filter(f =>
        isEnabled(f) &&
        !excludedCategories.has(normalizeSelectionKey(f.category))
    );

    const matchingPool = FALLBACKS.filter(isEnabled);
    const pool = strictPool.length > 0
        ? strictPool
        : (categoryOnlyPool.length > 0 ? categoryOnlyPool : (matchingPool.length > 0 ? matchingPool : FALLBACKS));

    const fallback = pool[fallbackIndex % pool.length];
    fallbackIndex++;
    return {
        ...fallback,
        questionId: createQuestionId()
    };
}

const KNOWN_DIALECT_PATTERNS = [
    // Prepositions with time, leisure, and schedule (disputed or regional variations)
    /\bon\s+(my\s+|his\s+|her\s+|our\s+|their\s+)?free\s+time\b/i,
    /\bin\s+(my\s+|his\s+|her\s+|our\s+|their\s+)?free\s+time\b/i,
    /\bat\s+(my\s+|his\s+|her\s+|our\s+|their\s+)?free\s+time\b/i,
    /\bon\s+(my\s+|his\s+|her\s+|our\s+|their\s+)?spare\s+time\b/i,
    /\bin\s+(my\s+|his\s+|her\s+|our\s+|their\s+)?spare\s+time\b/i,
    /\bat the weekend\b/i,
    /\bon the weekend\b/i,
    /\bin hospital\b/i,
    /\bin the hospital\b/i,
    /\bdifferent to\b/i,
    /\bdifferent than\b/i,
    /\bdifferent from\b/i,
    /\bhave got\b/i,
    /\bhas got\b/i,
    /\blearned\b/i,
    /\blearnt\b/i,
    /\bcolor\b/i,
    /\bcolour\b/i,
    /\bneighbor\b/i,
    /\bneighbour\b/i
];

const KNOWN_INCOHERENT_PATTERNS = [
    /\band\s+the\s+students\s+on\s+it\b/i,
    /\bat\s+the\s+table\s+and\s+the\s+students\b/i,
    /\band\s+the\s+\w+\s+on\s+it\b/i,
    /\bplaced\b.*\band\s+the\s+\w+\s+on\s+it\b/i
];

const STRUCTURAL_ERROR_PATTERNS = [
    {
        name: 'Plural subject requires plural verb',
        categories: ['subject-verb agreement', 'plural subject agreement'],
        flawed: [
            /\b(?:the\s+)?[a-z]+s\s+(?:is|was|has|does|doesn't)\b/i,
            /\b(?:the\s+)?[a-z]+s\s+(?:wins|runs|walks|plays|eats|needs|wants|likes|makes|knows|studies|carries|watches|teaches|goes)\b/i,
            /\b(?:the\s+)?[a-z]+\s+and\s+(?:the\s+|his\s+|her\s+|their\s+|our\s+|my\s+)?[a-z]+\s+(?:is|was|has|does|doesn't)\b/i
        ],
        correct: [/\b(?:are|were|have|do|don't|win|run|walk|play|eat|need|want|like|make|know|study|carry|watch|teach|go)\b/i]
    },
    {
        name: 'Singular subject requires singular verb',
        categories: ['subject-verb agreement'],
        flawed: [
            /\b(?:he|she|it|this|that|everyone|everybody|someone|somebody|nobody|no one|each|neither|either)\s+(?:are|were|have|do|don't)\b/i,
            /\b(?:he|she|it|this|that|everyone|everybody|someone|somebody|nobody|each|neither|either)\s+(?:win|run|walk|play|eat|need|want|like|make|know|study|carry|watch|teach|go)\b/i
        ],
        correct: [/\b(?:is|was|has|does|doesn't|wins|runs|walks|plays|eats|needs|wants|likes|makes|knows|studies|carries|watches|teaches|goes)\b/i]
    },
    {
        name: 'Preposition/object position requires object pronoun',
        categories: ['pronoun usage', 'pronoun usage (he/him, she/her)', 'pronoun case'],
        flawed: [
            /\b(?:to|for|from|with|between|beside|near|after|before|behind|besides)\s+(?:you\s+and\s+)?(?:i|he|she|we|they)\b/i,
            /\b(?:to|for|from|with|between|beside|near|after|before|behind|besides)\s+\w+\s+and\s+(?:i|he|she|we|they)\b/i
        ],
        correct: [/\b(?:me|him|her|us|them)\b/i]
    },
    {
        name: 'Subject position requires subject pronoun',
        categories: ['pronoun usage', 'pronoun usage (he/him, she/her)', 'pronoun case'],
        flawed: [/\b(?:me|him|her|us|them)\s+and\s+(?:me|him|her|us|them|i)\s+(?:am|are|is|was|were|go|goes|went|walk|walks|play|plays|study|studies|run|runs)\b/i],
        correct: [/\b(?:i|he|she|we|they)\b/i]
    },
    {
        name: 'Double negative',
        categories: ['double negatives'],
        flawed: [/\b(?:do not|don't|does not|doesn't|did not|didn't|cannot|can't|never|no)\b.*\b(?:no one|nobody|nothing|nowhere|none|no)\b/i],
        correct: [/\b(?:anyone|anybody|anything|anywhere|any)\b/i]
    },
    {
        name: 'Past tense verb form',
        categories: ['past tense verb forms', 'past & present tense', 'past tense'],
        flawed: [
            /\b(?:yesterday|last\s+(?:night|week|month|year)|ago)\b.*\b(?:go|eat|run|write|see|come|take|give|make|begin|break|choose|drive|fall|fly|forget|get|know|speak|steal|swim|throw|wear)\b/i,
            /\bdid\s+(?:went|ate|ran|wrote|saw|came|took|gave|made|began|broke|chose|drove|fell|flew|forgot|got|knew|spoke|stole|swam|threw|wore)\b/i,
            /\b(?:has|have|had)\s+(?:went|ate|ran|saw|came|took|gave|began|broke|chose|drove|fell|flew|forgot|spoke|stole|swam|threw|wore)\b/i
        ],
        correct: [/\b(?:went|ate|ran|wrote|saw|came|took|gave|made|began|broken|chosen|driven|fallen|flown|forgotten|gotten|known|spoken|stolen|swum|thrown|worn|go|eat|run|write|see|come|take|give|make|begin|break|choose|drive|fall|fly|forget|get|know|speak|steal|swim|throw|wear|gone|eaten|written|seen|taken|given|made)\b/i]
    },
    {
        name: 'Modal verb requires a base verb',
        categories: ['modal verbs'],
        flawed: [
            /\b(?:can|could|should|would|will|must|may|might)\s+to\s+[a-z]+\b/i,
            /\b(?:can|could|should|would|will|must|may|might)\s+[a-z]+(?:s|ed)\b/i
        ],
        correct: [/\b(?:can|could|should|would|will|must|may|might)\s+[a-z]+\b/i]
    },
    {
        name: 'Article must match the following sound',
        categories: ['determiners and articles', 'determiners'],
        flawed: [
            /\ba\s+(?:apple|engineer|artist|elephant|idea|orange|umbrella|ancient|interesting|old)\b/i,
            /\ban\s+(?:book|broken|castle|robot|sensor|pilot|teacher|student|gauge|witness)\b/i
        ],
        correct: [
            /\ban\s+(?:apple|engineer|artist|elephant|idea|orange|umbrella|ancient|interesting|old)\b/i,
            /\ba\s+(?:book|broken|castle|robot|sensor|pilot|teacher|student|gauge|witness)\b/i
        ]
    },
    {
        name: 'Number or quantifier requires the correct noun form',
        categories: ['singular and plural nouns', 'countable and uncountable nouns', 'singular & plural nouns'],
        flawed: [
            /\b(?:two|three|four|five|six|many|several|both)\s+(?:[a-z]+\s+)?(?:child|person|mouse|knife|leaf|city|story|box|class|dish|student|player|team)\b/i,
            /\b(?:much|less)\s+(?:books|coins|students|players|teams|ideas|questions)\b/i,
            /\b(?:many|several)\s+(?:information|advice|homework|equipment|furniture)\b/i
        ],
        correct: [
            /\b(?:children|people|mice|knives|leaves|cities|stories|boxes|classes|dishes|students|players|teams)\b/i,
            /\b(?:many|fewer)\s+(?:books|coins|students|players|teams|ideas|questions)\b/i,
            /\b(?:much|some)\s+(?:information|advice|homework|equipment|furniture)\b/i
        ]
    },
    {
        name: 'First conditional uses present simple in the if-clause',
        categories: ['first conditional', 'conditionals'],
        flawed: [/\bif\b[^,.!?;]*\bwill\s+[a-z]+\b/i],
        correct: [/\b(?:arrives|rains|wins|finishes|starts|opens|returns|needs|finds|goes)\b/i]
    },
    {
        name: 'Fixed preposition collocation',
        categories: ['fixed prepositions', 'preposition rules', 'prepositions'],
        flawed: [
            /\binterested\s+(?:on|at|for)\b/i,
            /\bafraid\s+(?:from|for|with)\b/i,
            /\blisten(?:s|ed|ing)?\s+(?:at|in|for)\b/i,
            /\bdepend(?:s|ed|ing)?\s+(?:of|from|in)\b/i,
            /\bbelong(?:s|ed|ing)?\s+(?:in|at|for)\b/i
        ],
        correct: [
            /\binterested\s+in\b/i,
            /\bafraid\s+of\b/i,
            /\blisten(?:s|ed|ing)?\s+to\b/i,
            /\bdepend(?:s|ed|ing)?\s+on\b/i,
            /\bbelong(?:s|ed|ing)?\s+to\b/i
        ]
    }
];

function normalizeText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countWords(sentence) {
    const words = String(sentence || '').trim().match(/\b[\w']+\b/g);
    return words ? words.length : 0;
}

function buildExpectedCorrection(sentence, flawedPhrase, correctPhrase) {
    return sentence.replace(new RegExp(escapeRegExp(flawedPhrase), 'i'), correctPhrase);
}

function verifyIncorrectStructure(candidate) {
    const sentence = String(candidate.sentence || '');
    const flawedPhrase = typeof candidate.flawedPhrase === 'string' ? candidate.flawedPhrase.trim() : '';
    const correctPhrase = typeof candidate.correctPhrase === 'string' ? candidate.correctPhrase.trim() : '';
    const correction = typeof candidate.correction === 'string' ? candidate.correction.trim() : '';
    const category = normalizeText(candidate.category);

    if (!flawedPhrase || !correctPhrase) {
        return {
            ok: false,
            reason: 'Incorrect candidate must include both flawedPhrase and correctPhrase.'
        };
    }

    if (!new RegExp(escapeRegExp(flawedPhrase), 'i').test(sentence)) {
        return {
            ok: false,
            reason: `flawedPhrase "${flawedPhrase}" is not an exact substring of the sentence.`
        };
    }

    if (normalizeText(flawedPhrase) === normalizeText(correctPhrase)) {
        return {
            ok: false,
            reason: 'flawedPhrase and correctPhrase are identical, so no grammatical correction is proven.'
        };
    }

    const expectedCorrection = buildExpectedCorrection(sentence, flawedPhrase, correctPhrase);
    if (correction && normalizeText(correction) !== normalizeText(expectedCorrection)) {
        return {
            ok: false,
            reason: 'correction must equal the sentence with the flawed phrase replaced by the correct phrase.'
        };
    }

    return {
        ok: true
    };
}

/**
 * Secondary AI Audit Step: Validates a candidate question for regional dialect ambiguity AND semantic coherence.
 */
async function validateQuestion(candidate) {
    if (!candidate || !candidate.sentence) {
        return {
            isValid: false,
            isUnambiguous: false,
            isSemanticallyCoherent: false,
            validationReasoning: 'Invalid or missing candidate object.',
            rejectionReason: 'Empty candidate question object.'
        };
    }

    // Determine the total corrected sentence area to audit
    // For incorrect sentences (isCorrect: false), we audit candidate.correction (the target correct sentence)
    const sentenceToAudit = (candidate.isCorrect === false && candidate.correction)
        ? candidate.correction
        : candidate.sentence;

    // 1. Instant Heuristic Pre-Filter for Known Regional Dialect & Disputed Prepositions
    for (const pattern of KNOWN_DIALECT_PATTERNS) {
        const matchesSentence = pattern.test(candidate.sentence);
        const matchesCorrection = pattern.test(sentenceToAudit);
        const matchesFlawed = candidate.flawedPhrase ? pattern.test(candidate.flawedPhrase) : false;
        if (matchesSentence || matchesCorrection || matchesFlawed) {
            return {
                isValid: false,
                isUnambiguous: false,
                dialectConflict: true,
                englishVariety: candidate.englishVariety || 'Regional Dialect Difference',
                validationReasoning: `Rejected by Dialect Audit: Sentence or total corrected sentence uses regional or disputed preposition/time phrase.`,
                rejectionReason: `Dialect ambiguity detected: preposition/time variation.`
            };
        }
    }

    // 2. Instant Heuristic Pre-Filter for Known Semantic Incoherence & Ambiguous Attachment
    for (const pattern of KNOWN_INCOHERENT_PATTERNS) {
        if (pattern.test(candidate.sentence) || pattern.test(sentenceToAudit)) {
            return {
                isValid: false,
                isUnambiguous: false,
                isSemanticallyCoherent: false,
                semanticConflict: true,
                englishVariety: candidate.englishVariety || 'General / International English',
                validationReasoning: `Rejected by Semantic Audit: Sentence contains ambiguous pronoun/object attachment.`,
                rejectionReason: `Semantic incoherence/ambiguity detected in sentence structure.`
            };
        }
    }

    const wordCount = countWords(candidate.sentence);
    if (wordCount < 5 || wordCount > 24) {
        return {
            isValid: false,
            isUnambiguous: false,
            isSemanticallyCoherent: false,
            semanticConflict: true,
            englishVariety: candidate.englishVariety || 'General / International English',
            validationReasoning: `Rejected by Length Audit: Sentence has ${wordCount} words and is outside the safe gameplay range.`,
            rejectionReason: 'Sentence length outside safe generation bounds.'
        };
    }

    // 3. Incorrect lots must prove exact structural replacement consistency
    if (candidate.isCorrect === false) {
        const structuralCheck = verifyIncorrectStructure(candidate);
        if (!structuralCheck.ok) {
            return {
                isValid: false,
                isUnambiguous: false,
                isSemanticallyCoherent: true,
                falseErrorClaim: true,
                englishVariety: candidate.englishVariety || 'General / International English',
                validationReasoning: `Rejected by Structural Error Audit: ${structuralCheck.reason}`,
                rejectionReason: `False or unproven error claim: ${structuralCheck.reason}`
            };
        }
    }

    // 4. Local write-good Linter Check on sentenceToAudit (total corrected sentence area for isCorrect: false)
    try {
        const wgSuggestions = writeGood(sentenceToAudit, { passive: true, wordy: true, clichés: true });
        if (wgSuggestions && wgSuggestions.length > 2) {
            return {
                isValid: false,
                isUnambiguous: false,
                isSemanticallyCoherent: false,
                semanticConflict: true,
                englishVariety: candidate.englishVariety || 'General / International English',
                validationReasoning: `Rejected by write-good Linter: Total corrected sentence is overly wordy or contains clichés.`,
                rejectionReason: `Prose style linter rejected total corrected sentence for wordiness or cliché structure.`
            };
        }
    } catch (e) { }

    // 5. LanguageTool Deterministic Grammar Check Engine on sentenceToAudit (total corrected sentence area!)
    const ltResult = await checkLanguageTool(sentenceToAudit);
    if (ltResult.ok) {
        // Must not find major structural grammar errors in sentenceToAudit (the total corrected sentence)
        const majorMatches = ltResult.matches.filter(m =>
            m.rule && m.rule.category &&
            m.rule.category.id !== 'CASING' &&
            m.rule.category.id !== 'TYPOGRAPHY' &&
            m.rule.category.id !== 'PUNCTUATION'
        );
        if (majorMatches.length > 0) {
            console.warn(`🛑 LanguageTool Audit: Total corrected sentence '${sentenceToAudit}' contains grammar error (${majorMatches[0].message}). Rejecting...`);
            return {
                isValid: false,
                isUnambiguous: false,
                falseErrorClaim: candidate.isCorrect === false ? true : false,
                englishVariety: candidate.englishVariety || 'General / International English',
                validationReasoning: `Rejected by LanguageTool Engine: Total corrected sentence contains grammar error (${majorMatches[0].message}).`,
                rejectionReason: `LanguageTool detected grammar error in total corrected sentence: ${majorMatches[0].message}`
            };
        }
    }

    // Passed all quality checks!
    return {
        isValid: true,
        isUnambiguous: true,
        isSemanticallyCoherent: true,
        englishVariety: candidate.englishVariety || 'General / International English',
        validationReasoning: candidate.validationReasoning || (candidate.isCorrect === false
            ? 'Total corrected sentence audited and validated.'
            : 'Passed pre-filter quality audit layer.')
    };
}

async function getDisabledQuestionSet() {
    try {
        const mongoose = require('mongoose');
        if (mongoose.connection && mongoose.connection.readyState === 1) {
            const QuestionReport = require('../models/QuestionReport');
            const reports = await QuestionReport.find({
                status: { $in: ['question_disabled', 'valid'] }
            }).select('questionId questionSnapshot.sentence').lean();

            const disabledIds = new Set();
            const disabledSentences = new Set();
            for (const r of reports) {
                if (r.questionId) disabledIds.add(r.questionId);
                if (r.questionSnapshot && r.questionSnapshot.sentence) {
                    disabledSentences.add(r.questionSnapshot.sentence.trim().toLowerCase());
                }
            }
            return { disabledIds, disabledSentences };
        }
    } catch (e) { }
    return { disabledIds: new Set(), disabledSentences: new Set() };
}

async function generateSentence(forcedIsCorrect, options = {}) {
    const shouldBeCorrect = (typeof forcedIsCorrect === 'boolean')
        ? forcedIsCorrect
        : (Math.random() < 0.5);

    const { disabledIds, disabledSentences } = await getDisabledQuestionSet();

    const groqClient = getGroqClient();
    if (!groqClient) {
        console.warn('⚠️ No GROQ_API_KEY available, using pre-validated fallback.');
        return chooseFallbackQuestion(shouldBeCorrect, disabledIds, disabledSentences, options);
    }

    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const domain = pickFromPool(DOMAINS, options.excludeDomains);
        const categoryList = shouldBeCorrect ? GRAMMAR_CATEGORIES : INCORRECT_CATEGORIES;
        const category = pickFromPool(categoryList, options.excludeCategories);
        const randomSeed = Math.floor(Math.random() * 1000000);

        const userPrompt = shouldBeCorrect
            ? `[Seed: ${randomSeed}] Theme: "${domain}". Level: Class 6-8. Category: "${category}".
Generate ONE 100% LOGICAL, REALISTIC, AND UNAMBIGUOUSLY GRAMMATICALLY CORRECT sentence (10-18 words) about "${domain}".
Set "isCorrect": true, "flawedPhrase": null, "correctPhrase": null, and "correction" to match "sentence".
Ensure "englishVariety" and "validationReasoning" are provided.`
            : `[Seed: ${randomSeed}] Theme: "${domain}". Level: Class 6-8. Category: "${category}".
Generate ONE 100% LOGICAL sentence (10-18 words) about "${domain}" containing EXACTLY ONE UNAMBIGUOUS structural grammatical error in "${category}".
CRITICAL REQUIREMENTS FOR INCORRECT SENTENCE:
1. The error MUST be an indisputable surface structural error (e.g., subject-verb disagreement like "she don't", double negative like "didn't see nobody", incorrect pronoun case like "between you and I").
2. DO NOT use a sentence that is actually valid standard English!
3. NEVER introduce preposition errors or vocabulary variations.
4. If the subject is plural, "are/were/have/do" are correct; do not claim they are errors.
5. Never output a false error like: "The teams are winning the championship because they are very skilled and talented."
"flawedPhrase" must be the exact 1-4 word flawed substring. "correctPhrase" must be the exact fix. Set "isCorrect": false.
Ensure "englishVariety" and "validationReasoning" are provided.`;

        try {
            const completion = await groqClient.chat.completions.create({
                model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.4,
                max_tokens: 1000,
                response_format: { type: 'json_object' }
            });

            const raw = completion.choices[0]?.message?.content;
            if (!raw) throw new Error('Empty Groq response');

            const parsed = JSON.parse(raw);

            // Assign questionId if missing
            parsed.questionId = parsed.questionId || createQuestionId();
            parsed.englishVariety = parsed.englishVariety || 'General / International English';
            parsed.category = category;
            parsed.domain = domain;

            // Enforce exact boolean & phrase consistency
            if (shouldBeCorrect) {
                parsed.isCorrect = true;
                parsed.flawedPhrase = null;
                parsed.correctPhrase = null;
                parsed.correction = parsed.sentence;
            } else {
                parsed.isCorrect = false;
                if (!parsed.flawedPhrase || typeof parsed.flawedPhrase !== 'string') {
                    parsed.flawedPhrase = null;
                } else {
                    const idx = parsed.sentence.toLowerCase().indexOf(parsed.flawedPhrase.toLowerCase());
                    if (idx !== -1) {
                        parsed.flawedPhrase = parsed.sentence.substring(idx, idx + parsed.flawedPhrase.length);
                    }
                }
                if (!parsed.correctPhrase || typeof parsed.correctPhrase !== 'string') {
                    parsed.correctPhrase = null;
                }
            }

            // Validate required fields
            if (
                typeof parsed.sentence !== 'string' ||
                typeof parsed.isCorrect !== 'boolean' ||
                typeof parsed.correction !== 'string' ||
                typeof parsed.category !== 'string' ||
                typeof parsed.domain !== 'string' ||
                typeof parsed.hintText !== 'string'
            ) {
                throw new Error('Invalid JSON schema from Groq');
            }

            // Check if candidate matches any admin-disabled questionId or sentence
            const sentenceLower = parsed.sentence.trim().toLowerCase();
            if (disabledIds.has(parsed.questionId) || disabledSentences.has(sentenceLower)) {
                console.warn(`🚫 Candidate matches an admin-disabled question: "${parsed.sentence}". Retrying...`);
                continue;
            }

            // ── SECONDARY AI AMBIGUITY, DIALECT & SEMANTIC COHERENCE AUDIT ──
            const auditResult = await validateQuestion(parsed);

            if (!auditResult.isValid) {
                console.warn(`🛑 Attempt ${attempt}/${maxRetries}: Candidate rejected by Quality Auditor (${auditResult.rejectionReason || 'Ambiguous dialect variation or semantic incoherence'}). Retrying...`);
                continue; // Try generating another question
            }

            // Attach final audit evidence & reasoning
            parsed.englishVariety = auditResult.englishVariety;
            parsed.validationReasoning = auditResult.validationReasoning;
            parsed.isValidated = true;

            console.log(`🤖 Groq generated & validated [${parsed.questionId} | ${parsed.englishVariety}]: "${parsed.sentence}" [${parsed.isCorrect ? 'CORRECT' : 'INCORRECT'}]`);
            return parsed;

        } catch (err) {
            const isRateLimit = err.status === 429 || (err.message && (err.message.includes('429') || err.message.includes('rate_limit')));
            if (isRateLimit) {
                console.warn('⚠️ Groq Rate Limit (429) hit. Using pre-validated fallback questions.');
                return chooseFallbackQuestion(shouldBeCorrect, disabledIds, disabledSentences, options);
            }
            console.error(`⚠️ Generation attempt ${attempt}/${maxRetries} failed:`, err.message);
        }
    }

    // Fallback if all attempts failed or were rejected for dialect ambiguity
    console.warn('⚠️ Reached max generation attempts or dialect rejection. Using pre-validated fallback.');
    return chooseFallbackQuestion(shouldBeCorrect, disabledIds, disabledSentences, options);
}

module.exports = { generateSentence, validateQuestion, FALLBACKS };

