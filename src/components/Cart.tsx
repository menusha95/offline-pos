interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

type Props = {
  items: CartItem[];
  total: number;
  onQtyChange: (productId: string, qty: number) => void;
  onCheckout: () => void;
  onPrintLast: () => void;
};

export default function Cart({
  items,
  total,
  onQtyChange,
  onCheckout,
  onPrintLast,
}: Props) {
  const hasItems = items.length > 0;

  return (
    <div className="cart-container">
      <h3>Cart</h3>
      <div className="cart-items">
        {items.map((item) => (
          <div key={item.id} className="cart-item">
            <div>
              {item.name}
              <div style={{ fontSize: "14px", opacity: 0.7 }}>
                ${item.price.toFixed(2)}
              </div>
            </div>
            <div className="cart-qty-controls">
              <button
                type="button"
                className="cart-qty-btn"
                onClick={() => onQtyChange(item.id, item.qty - 1)}
              >
                -
              </button>
              <span>{item.qty}</span>
              <button
                type="button"
                className="cart-qty-btn"
                onClick={() => onQtyChange(item.id, item.qty + 1)}
              >
                +
              </button>
            </div>
          </div>
        ))}
        {!items.length && (
          <div style={{ opacity: 0.7, fontSize: "0.85rem" }}>No items yet.</div>
        )}
      </div>
      <div className="cart-footer">
        <div className="cart-total">
          <span>Total</span>
          <strong>${total.toFixed(2)}</strong>
        </div>
        <button
          type="button"
          className="primary-btn"
          onClick={onCheckout}
          disabled={!hasItems}
        >
          Place order
        </button>
        <button type="button" className="secondary-btn" onClick={onPrintLast}>
          Print last receipt
        </button>
      </div>
    </div>
  );
}
