import type { LoginInput, LoginResult, MfaInput, Session, SsoProvider } from '../domain/auth';
import type { Page } from '../domain/common';
import type { DeskType } from '../domain/desk';
import type {
  Automation,
  AutomationKind,
  AutomationPlan,
  AutomationRun,
  PlanRequest,
} from '../domain/automation';
import type {
  Alert,
  Approval,
  ApprovalDecision,
  AuditEvent,
  AuditQuery,
  ConnectSourceInput,
  ConnectedSource,
  CreateAlertInput,
  Notification,
  Shortcut,
} from '../domain/operations';
import type { DeskOverview } from '../domain/overview';
import type { AskRequest, Suggestion, TwinStreamEvent } from '../domain/twin';

/**
 * The contract every client codes against. Today it is served by the in-memory mock adapter;
 * the HTTP adapter will implement the same interface against the backend, so no screen changes
 * when the SQL database and the AI services arrive.
 *
 * Authorisation and per-user data separation are the server's job. Implementations receive the
 * session from the transport (an HttpOnly cookie), never from a parameter the caller controls.
 */
export interface AuthApi {
  login(input: LoginInput): Promise<LoginResult>;
  verifyMfa(input: MfaInput): Promise<Session>;
  startSso(provider: SsoProvider): Promise<LoginResult>;
  getSession(): Promise<Session | null>;
  /** Slides the server-side idle window. Called on user activity, throttled by the client. */
  touch(): Promise<void>;
  logout(reason?: 'user' | 'timeout' | 'expired'): Promise<void>;
}

export interface TwinApi {
  /** Streams the router, research, drafting and compliance stages of one answer. */
  ask(request: AskRequest, signal?: AbortSignal): AsyncIterable<TwinStreamEvent>;
  suggestions(deskType: DeskType): Promise<Suggestion[]>;
  feedback(answerId: string, rating: 'helpful' | 'not-helpful'): Promise<void>;
}

export interface DeskApi {
  overview(): Promise<DeskOverview>;
  setActionItemDone(id: string, done: boolean): Promise<void>;
  setDeskType(deskType: DeskType): Promise<Session>;
}

export interface AutomationsApi {
  list(kind?: AutomationKind): Promise<Automation[]>;
  get(id: string): Promise<Automation>;
  runs(id: string): Promise<AutomationRun[]>;
  plan(request: PlanRequest): Promise<AutomationPlan>;
  save(draft: Automation): Promise<Automation>;
  setStatus(id: string, status: 'active' | 'paused'): Promise<Automation>;
  run(id: string): Promise<AutomationRun>;
}

export interface ShortcutsApi {
  list(): Promise<Shortcut[]>;
  remove(id: string): Promise<void>;
}

export interface AlertsApi {
  list(): Promise<Alert[]>;
  create(input: CreateAlertInput): Promise<Alert>;
  setStatus(id: string, status: 'active' | 'paused'): Promise<Alert>;
  remove(id: string): Promise<void>;
  notifications(): Promise<Notification[]>;
  markRead(ids: string[]): Promise<void>;
}

export interface ApprovalsApi {
  list(): Promise<Approval[]>;
  decide(decision: ApprovalDecision): Promise<Approval>;
}

export interface SourcesApi {
  list(): Promise<ConnectedSource[]>;
  /** Credentials go straight to the vault endpoint; the response never echoes them. */
  connect(input: ConnectSourceInput): Promise<ConnectedSource>;
  revoke(id: string): Promise<ConnectedSource>;
  sync(id: string): Promise<ConnectedSource>;
}

export interface AuditApi {
  list(query: AuditQuery): Promise<Page<AuditEvent>>;
  /** Server-generated export; the client only receives a ready file. */
  exportCsv(query: AuditQuery): Promise<{ filename: string; content: string }>;
}

export interface TwinDeskApi {
  auth: AuthApi;
  twin: TwinApi;
  desk: DeskApi;
  automations: AutomationsApi;
  shortcuts: ShortcutsApi;
  alerts: AlertsApi;
  approvals: ApprovalsApi;
  sources: SourcesApi;
  audit: AuditApi;
}
