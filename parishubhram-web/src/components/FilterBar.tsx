import './FilterBar.css';

interface FilterBarProps {
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  categoryFilter: string;
  setCategoryFilter: (category: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export default function FilterBar({
  statusFilter,
  setStatusFilter,
  categoryFilter,
  setCategoryFilter,
  searchQuery,
  setSearchQuery,
}: FilterBarProps) {
  return (
    <div className="filter-wrapper">
      {/* Search by Area or Ward */}
      <div className="filter-search-box">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search by area or ward (e.g. Moosapet, Kukatpally)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="clear-search-btn">
            ✕
          </button>
        )}
      </div>

      <div className="filter-controls-row">
        {/* Status Filter Pills */}
        <div className="status-pills-group">
          {[
            { id: 'all', label: 'All Issues' },
            { id: 'reported', label: '🔴 Active' },
            { id: 'resolved', label: '🟢 Resolved' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={`filter-pill ${statusFilter === s.id ? 'active' : ''}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Category Dropdown */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="category-dropdown"
        >
          <option value="all">All Waste Types</option>
          <option value="garbage_dump">🗑️ Garbage Dump</option>
          <option value="overflowing_bin">📦 Overflowing Bin</option>
          <option value="drain_overflow">🚰 Drainage Overflow</option>
          <option value="construction_debris">🧱 C&D Debris</option>
          <option value="plastic_waste">🥤 Plastic Waste</option>
          <option value="road_damage">🕳️ Road Damage</option>
        </select>
      </div>
    </div>
  );
}