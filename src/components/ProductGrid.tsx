interface Product {
  id: string;
  name: string;
  price: number;
  category?: string;
  icon: string;
}

type Props = {
  products: Product[];
  onSelect: (product: Product) => void;
};

export default function ProductGrid({ products, onSelect }: Props) {
  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    product: Product
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(product);
    }
  };

  return (
    <div className="product-grid">
      {products.map((p) => (
        <button
          key={p.id}
          className="product-card"
          onClick={() => onSelect(p)}
          onKeyDown={(e) => handleKeyDown(e, p)}
          type="button"
        >
          <span className="product-emoji" aria-hidden="true">
            {p.icon}
          </span>
          <div className="product-name">{p.name}</div>
          <div className="product-price">
            {p.category ? `${p.category} · ` : ""}${p.price.toFixed(2)}
          </div>
          <div className="product-button">
            <a>ADD</a>
          </div>
        </button>
      ))}
    </div>
  );
}
