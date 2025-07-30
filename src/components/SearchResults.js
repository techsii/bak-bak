import React, { useEffect, useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import './SearchResults.css';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

const mockData = [
  { id: 1, type: 'Topic', name: 'Mental Health Support' },
  { id: 2, type: 'User', name: 'John Doe' },
  { id: 3, type: 'Topic', name: 'Football Fans Chat' },
  { id: 4, type: 'User', name: 'Neel Bhattacharjee' },
  { id: 5, type: 'Topic', name: 'Startup Founders Lounge' },
  { id: 6, type: 'User', name: 'Anjali R.' },
];

function SearchResults() {
  const query = useQuery();
  const searchTerm = query.get('query') || '';
  const [filteredResults, setFilteredResults] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (searchTerm.trim()) {
      const results = mockData.filter((item) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredResults(results);
    } else {
      setFilteredResults([]);
    }
  }, [searchTerm]);

  const handleSendRequest = (userId) => {
    navigate(`/friend-request/${userId}`);
  };

  return (
    <div className="search-results-container">
      <h2 className="search-title">
        Search Results for: <span className="highlight">"{searchTerm}"</span>
      </h2>

      {filteredResults.length > 0 ? (
        <ul className="results-list">
          {filteredResults.map((item) => (
            <li key={item.id} className="result-item">
              <div className="item-details">
                <span className="item-type">{item.type}:</span>
                <span className="item-name">{item.name}</span>
              </div>
              <div className="item-actions">
                {item.type === 'User' && (
                  <>
                    <button 
                      className="send-request-btn"
                      onClick={() => handleSendRequest(item.id)}
                    >
                      Send Friend Request
                    </button>
                    <Link to={`/profile/${item.id}`} className="view-profile-btn">
                      View Profile
                    </Link>
                  </>
                )}
                {item.type === 'Topic' && (
                  <Link to={`/topic/${item.id}`} className="view-topic-btn">
                    View Topic
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="no-results">No matching results found.</p>
      )}
    </div>
  );
}

export default SearchResults;
