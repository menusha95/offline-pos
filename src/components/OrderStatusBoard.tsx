interface Order {
  id: string;
  total: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

type Props = {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: string) => void;
};

const NEXT_STATUS: Record<string, string | undefined> = {
  pending: "preparing",
  preparing: "ready",
  ready: "completed",
};

export default function OrderStatusBoard({ orders, onUpdateStatus }: Props) {
  return (
    <div className="order-status-board">
      <h3>Orders</h3>
      {orders.length === 0 && (
        <div style={{ opacity: 0.7, fontSize: "0.85rem" }}>No orders yet.</div>
      )}
      {orders.map((order) => {
        const nextStatus = NEXT_STATUS[order.status];
        return (
          <div key={order.id} className="order-row">
            <div className="order-row-main">
              <div className="order-row-left">
                <div className="order-id-line">
                  <span className="order-id-chip">#{order.id.slice(-6)}</span>
                </div>
                <div className="order-meta">
                  <span className="order-total-label">Total</span>
                  <span className="order-total-value">
                    ${order.total.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="order-row-center">
                <span
                  className={`order-status-pill order-status-${order.status}`}
                >
                  {order.status}
                </span>
              </div>

              <div className="order-actions">
                {nextStatus && (
                  <button
                    type="button"
                    className="order-action-btn"
                    onClick={() => onUpdateStatus(order.id, nextStatus)}
                  >
                    <span className="order-action-label">→ {nextStatus}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
