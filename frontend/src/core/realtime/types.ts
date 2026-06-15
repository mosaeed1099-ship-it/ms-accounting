export type WsEventType =
  | 'clients_updated'
  | 'tasks_updated'
  | 'leads_updated'
  | 'obligations_updated'
  | 'monthly_fees_updated'
  | 'collections_updated'
  | 'accounting_updated'
  | 'dashboard_updated'
  | 'ping'

export interface WsMessage {
  type: WsEventType
  payload?: unknown
}

export type WsListener = (payload: unknown) => void
