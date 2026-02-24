import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SearchResult = {
  title: string;
  url: string;
  content: string;
  score: number;
};

type ClassificationMatch = {
  category: string;
  reference: string;
  matched_terms: string[];
  why: string;
};

type ClassificationRule = {
  category: string;
  reference: string;
  why: string;
  keywords: string[];
};

const PROHIBITED_RULES: ClassificationRule[] = [
  {
    category: 'Social scoring of natural persons',
    reference: 'Article 5',
    why: 'The AI Act prohibits social scoring practices by public authorities.',
    keywords: [
      'social scoring',
      'social score',
      'citizen score',
      'reputation score by government',
    ],
  },
  {
    category: 'Manipulative or exploitative practices',
    reference: 'Article 5',
    why: 'Manipulative AI targeting vulnerabilities can be prohibited.',
    keywords: [
      'subliminal',
      'manipulative',
      'exploit vulnerabilities',
      'exploit children',
      'exploit disability',
    ],
  },
  {
    category: 'Untargeted scraping for facial recognition databases',
    reference: 'Article 5',
    why: 'Untargeted scraping of facial images is prohibited.',
    keywords: [
      'scrape facial images',
      'facial image scraping',
      'build face database',
      'cctv face scraping',
    ],
  },
  {
    category: 'Real-time remote biometric identification in public spaces',
    reference: 'Article 5',
    why: 'This use case is generally prohibited except narrow legal exceptions.',
    keywords: [
      'real-time biometric identification',
      'live facial recognition in public',
      'public space facial recognition',
      'remote biometric identification',
    ],
  },
];

const HIGH_RISK_RULES: ClassificationRule[] = [
  {
    category: 'Biometric identification or categorization',
    reference: 'Article 6 + Annex III',
    why: 'Biometric uses are high-risk in multiple contexts.',
    keywords: [
      'biometric',
      'face recognition',
      'iris',
      'fingerprint',
      'voiceprint',
      'emotion recognition',
    ],
  },
  {
    category: 'Critical infrastructure operations',
    reference: 'Article 6 + Annex III',
    why: 'AI for critical infrastructure operation can be high-risk.',
    keywords: [
      'critical infrastructure',
      'power grid',
      'water supply',
      'traffic control',
      'transport network safety',
    ],
  },
  {
    category: 'Education and vocational training',
    reference: 'Article 6 + Annex III(3)',
    why: 'AI used for admission, evaluation, or steering learning outcomes may be high-risk.',
    keywords: [
      'education',
      'student assessment',
      'grading',
      'exam scoring',
      'admission',
      'curriculum',
      'learning outcomes',
      'adaptive quiz',
      'e-learning',
      'lms',
      'lecture',
      'coursework',
    ],
  },
  {
    category: 'Employment and worker management',
    reference: 'Article 6 + Annex III',
    why: 'AI in hiring, promotion, or worker monitoring can be high-risk.',
    keywords: [
      'recruitment',
      'hiring',
      'cv screening',
      'employee monitoring',
      'performance scoring',
      'promotion decision',
    ],
  },
  {
    category: 'Access to essential services',
    reference: 'Article 6 + Annex III',
    why: 'AI used to decide eligibility for essential services may be high-risk.',
    keywords: [
      'credit scoring',
      'loan approval',
      'insurance pricing',
      'benefits eligibility',
      'public assistance eligibility',
    ],
  },
  {
    category: 'Law enforcement',
    reference: 'Article 6 + Annex III',
    why: 'Law enforcement risk assessment and profiling are high-risk domains.',
    keywords: [
      'law enforcement',
      'predictive policing',
      'criminal risk scoring',
      'police profiling',
    ],
  },
  {
    category: 'Migration, asylum, border control',
    reference: 'Article 6 + Annex III',
    why: 'Migration and border decision systems are high-risk domains.',
    keywords: [
      'border control',
      'asylum decision',
      'visa decision',
      'migration risk assessment',
    ],
  },
  {
    category: 'Administration of justice or democratic processes',
    reference: 'Article 6 + Annex III',
    why: 'Judicial and democratic decision support can be high-risk.',
    keywords: [
      'judge support',
      'sentencing recommendation',
      'court decision support',
      'voter influence',
      'election targeting',
    ],
  },
];

const LIMITED_RISK_RULES: ClassificationRule[] = [
  {
    category: 'AI chatbot interaction',
    reference: 'Article 50',
    why: 'Chatbot systems generally trigger transparency obligations.',
    keywords: [
      'chatbot',
      'virtual assistant',
      'ai assistant',
      'conversational ai',
    ],
  },
  {
    category: 'Deepfake or synthetic media generation',
    reference: 'Article 50',
    why: 'Synthetic content generation can trigger disclosure duties.',
    keywords: [
      'deepfake',
      'synthetic media',
      'ai-generated image',
      'ai-generated video',
      'voice clone',
    ],
  },
  {
    category: 'Emotion recognition or biometric categorization',
    reference: 'Article 50',
    why: 'These systems may carry specific transparency obligations.',
    keywords: [
      'emotion recognition',
      'emotion detection',
      'biometric categorization',
    ],
  },
];

@Injectable()
export class ComplianceToolService {
  private readonly logger = new Logger(ComplianceToolService.name);
  private readonly tavilyKey: string | undefined;

  private readonly allowedDomains = [
    'eur-lex.europa.eu',
    'ai-act-service-desk.ec.europa.eu',
    'digital-strategy.ec.europa.eu',
  ];

  constructor(configService: ConfigService) {
    this.tavilyKey = configService.get<string>('TAVILY_API_KEY');
  }

  public getTools() {
    return [
      {
        type: 'file_search',
        file_search: {
          max_num_results: 5,
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_web',
          description:
            'MANDATORY TOOL: You MUST use this for ALL compliance questions. Search official EU AI Act sources (eur-lex.europa.eu, ai-act-service-desk.ec.europa.eu, digital-strategy.ec.europa.eu) for up-to-date information.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query to find relevant information',
              },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'classify_risk',
          description:
            'Classify an AI system under the EU AI Act using system purpose and context. Return structured JSON with matched categories, relevant articles, obligations, and missing information.',
          parameters: {
            type: 'object',
            properties: {
              system_description: {
                type: 'string',
                description:
                  'Description of the AI system intended purpose, users, and impact.',
              },
              features: {
                type: 'array',
                items: { type: 'string' },
                description: 'Key system features and decision points.',
              },
              intended_use: {
                type: 'string',
                description:
                  'What the system is intended to do in practice (admission, grading, hiring, etc.).',
              },
              affected_people: {
                type: 'string',
                description:
                  'Who is affected by outputs (students, workers, consumers, citizens).',
              },
              decision_impact: {
                type: 'string',
                description:
                  'Whether output influences or determines legal/similar significant decisions.',
              },
            },
            required: ['system_description'],
          },
        },
      },
    ];
  }

  public async searchWebRestricted(query: string) {
    if (!this.tavilyKey) {
      return { error: 'TAVILY_API_KEY not configured', results: [], query };
    }

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.tavilyKey,
          query,
          search_depth: 'advanced',
          include_domains: this.allowedDomains,
          max_results: 5,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.warn(`Tavily search failed: ${response.status} ${body}`);
        return {
          error: `Search request failed with status ${response.status}`,
          results: [],
          query,
        };
      }

      const body = (await response.json()) as { results?: SearchResult[] };

      return {
        query,
        results: (body.results ?? []).map((item) => ({
          title: item.title ?? '',
          url: item.url ?? '',
          content: item.content ?? '',
          score: item.score ?? 0,
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Tavily search exception: ${message}`);
      return { error: message, results: [], query };
    }
  }

  public classifyRisk(systemDescription: string, features?: string[]) {
    const text = [systemDescription, ...(features ?? [])]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase();

    const prohibitedMatches = this.findMatches(text, PROHIBITED_RULES);
    if (prohibitedMatches.length > 0) {
      return {
        risk_level: 'Prohibited AI Practice',
        confidence: 'high',
        reasoning:
          'One or more indicators map to prohibited AI practices. This should be treated as non-deployable until legal review confirms scope and exceptions.',
        matched_categories: prohibitedMatches,
        relevant_articles: ['Article 5'],
        obligations: [
          'Do not place this prohibited use case on the EU market.',
          'Perform immediate legal review and redesign system purpose.',
          'Document prohibited-use controls in governance policy.',
        ],
        article_coverage: [
          {
            area: 'Prohibited practice screening',
            articles: ['Article 5'],
            status: 'Triggered',
          },
          {
            area: 'Transparency',
            articles: ['Article 50'],
            status: 'May still apply to non-prohibited features.',
          },
        ],
        missing_information: this.buildMissingInformationHints(text),
      };
    }

    const highRiskMatches = this.findMatches(text, HIGH_RISK_RULES);
    if (highRiskMatches.length > 0) {
      const educationMatched = highRiskMatches.some((entry) =>
        entry.category.toLowerCase().includes('education'),
      );

      return {
        risk_level: 'High Risk',
        confidence: educationMatched ? 'high' : 'medium',
        reasoning: educationMatched
          ? 'The system appears to be used in education/training (for example assessment, adaptive learning, learning outcome steering), which is typically within Annex III high-risk scope depending on intended purpose.'
          : 'The system matches one or more Annex III high-risk domains.',
        matched_categories: highRiskMatches,
        relevant_articles: [
          'Article 6',
          'Annex III',
          'Articles 9-15',
          'Article 16',
          'Article 26',
          'Article 43',
        ],
        obligations: [
          'Establish risk management system (Art. 9).',
          'Ensure data governance and quality controls (Art. 10).',
          'Maintain technical documentation (Art. 11).',
          'Enable logging and traceability (Art. 12).',
          'Provide transparency and instructions for use (Art. 13).',
          'Implement human oversight controls (Art. 14).',
          'Meet robustness, accuracy, and cybersecurity requirements (Art. 15).',
          'Complete conformity assessment before market placement (Art. 43).',
          'Ensure deployer obligations are operationalized (Art. 26).',
        ],
        article_coverage: [
          {
            area: 'Qualification',
            articles: ['Article 6', 'Annex III'],
            status: 'Triggered by matched categories.',
          },
          {
            area: 'Provider core requirements',
            articles: ['Articles 9-15', 'Article 16'],
            status: 'Apply when system is confirmed high-risk.',
          },
          {
            area: 'Conformity assessment',
            articles: ['Article 43'],
            status: 'Required before market placement/use.',
          },
          {
            area: 'Deployer obligations',
            articles: ['Article 26'],
            status: 'Apply to customer/operator deployment.',
          },
          {
            area: 'Transparency overlays',
            articles: ['Article 50'],
            status: 'Also apply where users interact with AI outputs.',
          },
        ],
        missing_information: this.buildMissingInformationHints(text),
      };
    }

    const limitedMatches = this.findMatches(text, LIMITED_RISK_RULES);
    if (limitedMatches.length > 0) {
      return {
        risk_level: 'Limited Risk',
        confidence: 'medium',
        reasoning:
          'The system appears to trigger transparency-related obligations.',
        matched_categories: limitedMatches,
        relevant_articles: ['Article 50'],
        obligations: [
          'Inform users they are interacting with an AI system.',
          'Label synthetic/deepfake content where applicable.',
          'Maintain user-facing transparency notices and logs.',
        ],
        article_coverage: [
          {
            area: 'Transparency obligations',
            articles: ['Article 50'],
            status: 'Triggered',
          },
        ],
        missing_information: this.buildMissingInformationHints(text),
      };
    }

    return {
      risk_level: 'Needs More Context (Provisional Minimal Risk)',
      confidence: 'low',
      reasoning:
        'No strong prohibited/high-risk/limited-risk trigger was detected from the available description. A full determination needs intended-purpose and decision-impact details.',
      matched_categories: [],
      relevant_articles: ['Article 5', 'Article 6', 'Annex III', 'Article 50'],
      obligations: [
        'Perform intended-purpose review with legal and product teams.',
        'Document scope boundaries to avoid high-risk drift.',
        'Apply voluntary controls and governance monitoring.',
      ],
      article_coverage: [
        {
          area: 'Qualification',
          articles: ['Article 5', 'Article 6', 'Annex III'],
          status: 'Not triggered from current description.',
        },
        {
          area: 'Transparency',
          articles: ['Article 50'],
          status: 'Check if user-facing AI interactions exist.',
        },
      ],
      missing_information: this.buildMissingInformationHints(text),
    };
  }

  private findMatches(
    text: string,
    rules: ClassificationRule[],
  ): ClassificationMatch[] {
    const matches: ClassificationMatch[] = [];

    for (const rule of rules) {
      const matchedTerms = this.extractMatchedTerms(text, rule.keywords);
      if (matchedTerms.length === 0) {
        continue;
      }

      matches.push({
        category: rule.category,
        reference: rule.reference,
        matched_terms: matchedTerms,
        why: rule.why,
      });
    }

    return matches;
  }

  private extractMatchedTerms(text: string, keywords: string[]): string[] {
    const matches = new Set<string>();

    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matches.add(keyword);
      }
    }

    return Array.from(matches);
  }

  private buildMissingInformationHints(text: string): string[] {
    const hints: string[] = [];

    if (!text.includes('intended') && !text.includes('purpose')) {
      hints.push(
        'Clarify intended purpose: advisory-only vs decision-making system.',
      );
    }

    if (
      !text.includes('admission') &&
      !text.includes('grading') &&
      !text.includes('hiring') &&
      !text.includes('eligibility') &&
      !text.includes('approval')
    ) {
      hints.push(
        'Specify whether outputs affect admission, grading, hiring, eligibility, or other significant decisions.',
      );
    }

    if (
      !text.includes('human oversight') &&
      !text.includes('human review') &&
      !text.includes('manual review')
    ) {
      hints.push(
        'Describe human oversight controls (who can override/approve AI output).',
      );
    }

    if (!text.includes('eu') && !text.includes('eea')) {
      hints.push(
        'Confirm deployment geography (EU/EEA scope can change obligations).',
      );
    }

    return hints;
  }
}
