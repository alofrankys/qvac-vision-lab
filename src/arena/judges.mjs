export class JudgeProvider {
  constructor(id) { this.id = id }
  async judge() { throw new Error(`${this.id} is an integration boundary only`) }
}

export class UserJudgeProvider extends JudgeProvider {
  constructor() { super('USER_JUDGE') }
  async judge(input) { return input.judgment }
}

export const JUDGE_PROVIDER_BOUNDARIES = Object.freeze([
  { id: 'GOLD_ANSWER_SCORER', class: 'DETERMINISTIC', ready: true, authoritativeByDefault: true, sendsImagesExternally: false },
  { id: 'USER_JUDGE', class: 'HUMAN', ready: true, authoritativeByDefault: true, sendsImagesExternally: false },
  { id: 'BLIND_HUMAN_JUDGE', class: 'HUMAN', ready: true, authoritativeByDefault: true, sendsImagesExternally: false },
  { id: 'CODEX_VISUAL_REVIEW', class: 'AI_ASSISTED', ready: false, authoritativeByDefault: false, sendsImagesExternally: false },
  { id: 'LOCAL_AI_JUDGE', class: 'AI', ready: false, authoritativeByDefault: false, sendsImagesExternally: false },
  { id: 'EXTERNAL_AI_JUDGE', class: 'AI', ready: false, authoritativeByDefault: false, sendsImagesExternally: true, requiresExplicitUserAction: true }
])
