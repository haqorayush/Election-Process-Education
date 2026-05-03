/**
 * Shared type definitions for the VoteGuide AI application.
 * Centralised here so both components and utility modules stay in sync.
 * @module types
 */

/** The two chat modes available in the UI. */
export type ChatMode = 'guided' | 'ai';

/** Message sender identity. */
export type Sender = 'user' | 'bot';

/** Stages in the voter-registration journey state machine. */
export type Stage =
  | 'unknown'
  | 'eligible_not_registered'
  | 'registered'
  | 'ready_to_vote'
  | 'completed'
  | 'not_eligible';

/** Named UI actions the backend can instruct the frontend to perform. */
export type ApiActionName =
  | 'show_checklist'
  | 'start_simulation'
  | 'offer_simulation'
  | 'show_electoral_roll_link'
  | 'show_timeline'
  | 'show_celebration';

/** A backend-driven UI action instruction. */
export type ApiAction = {
  type: 'ui_action' | string;
  name: ApiActionName | string;
};

/** A single chat message (user or bot). */
export type Message = {
  sender: Sender;
  text: string;
  actions?: ApiAction[];
  suggestions?: string[];
};

/** Backend session state for a single user. */
export type BackendState = {
  age: number | null;
  location: string | null;
  has_voter_id: string;
  stage: Stage;
  simulation_step: 'id_check' | 'evm_machine' | null;
  next_step?: string;
};

/** Shape of the response from POST /api/chat. */
export type ChatResponse = {
  message: string;
  stage: Stage;
  next_step?: string;
  actions?: ApiAction[];
  suggestions?: string[];
};

/** Options for the guided-mode send helper. */
export type SendOptions = {
  showUserMessage?: boolean;
  replaceMessages?: boolean;
  languageOverride?: string;
};

/** Default backend state used before hydration. */
export const initialUserState: BackendState = {
  age: null,
  location: null,
  has_voter_id: 'unknown',
  stage: 'unknown',
  simulation_step: null,
};
