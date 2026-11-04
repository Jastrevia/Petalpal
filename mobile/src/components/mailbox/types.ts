export type LetterCategory =
  | 'garden'
  | 'friend'
  | 'system'
  | 'seasonal'
  | 'invitation';

export type BotanicalIconType =
  | 'crocus'
  | 'bellflower'
  | 'chamomile'
  | 'lavender'
  | 'sprig';

export type PaperTone = 'cream' | 'aged' | 'rose' | 'sage' | 'lavender';

export type MailboxVisualState =
  | 'holding' // State 1: Floating stack of envelopes hovering above palms
  | 'opening' // State 2: Selected envelope rising forward, seal breaking & unfolding
  | 'reading'; // State 3: Unfolded stationery letter dominating foreground with fanned stack behind

export type MailboxPhase =
  | 'stack'          // State 1: Resting floating stack
  | 'lifting'        // Stage A: Selected envelope lifts forward
  | 'opening'        // Stage B: Flap hinges open backward (-180deg)
  | 'extracting'     // Stage C: Folded stationery paper visibly emerges from pocket
  | 'unfolding'      // Stage D: Paper expands along fold creases into reading letter
  | 'reading'        // State 3: Reading open letter
  | 'closing_fold'   // Reverse D: Paper collapses back to folded dimensions
  | 'closing_insert' // Reverse C: Paper slides down into envelope pocket
  | 'closing_flap'   // Reverse B: Flap hinges closed (0deg)
  | 'closing';       // Reverse A: Envelope settles into stack

export interface Letter {
  id: string;
  sender: string;
  /** A friend's profile avatar, for notes left in the Garden; absent on PetalPal letters. */
  senderAvatar?: string | null;
  subject: string;
  snippet: string;
  date: string;
  category: LetterCategory;
  botanicalIcon: BotanicalIconType;
  headline?: string;
  body: string;
  illustrationType?: 'gazebo' | 'flower' | 'none';
  signoff?: string;
  signature?: string;
  footerQuote?: string;
  postmarkText?: string;
  read: boolean;
  paperTone?: PaperTone;
  estimatedHeight?: number; // for flexible paper sizing
}

export interface MailboxState {
  visualState: MailboxVisualState;
  phase: MailboxPhase;
  selectedLetterId: string;
  pendingLetterId: string | null;
  isTransitioning: boolean;
  stackOrder: string[];
}
