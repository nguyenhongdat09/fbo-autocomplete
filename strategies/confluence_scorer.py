"""
Confluence Scorer for combining multiple technical indicators
"""


class ConfluenceScorer:
    """
    A scorer that combines multiple technical indicators with weighted scoring.
    
    This class evaluates the confluence (alignment) of multiple technical indicators
    to generate a composite score for trading decisions.
    """
    
    def __init__(self, weights=None, adx_enabled=True, adx_threshold=25.0):
        """
        Initialize the ConfluenceScorer.
        
        Args:
            weights (dict): Dictionary of indicator weights. Keys should be indicator names
                          (e.g., 'fvg', 'vwap', 'obv', 'volume'). Values should be numeric weights.
                          If None, uses default equal weights.
            adx_enabled (bool): Whether to use ADX (Average Directional Index) filtering.
            adx_threshold (float): The ADX threshold value. Signals are typically considered
                                  stronger when ADX is above this threshold.
        """
        # Default weights if none provided
        self.default_weights = {
            'fvg': 40,
            'vwap': 20,
            'obv': 20,
            'volume': 20,
        }
        
        # Use provided weights or defaults
        self.weights = weights if weights is not None else self.default_weights
        
        # Validate that weights sum to 100
        total_weight = sum(self.weights.values())
        if total_weight != 100:
            # Normalize weights to sum to 100
            self.weights = {k: (v / total_weight) * 100 for k, v in self.weights.items()}
        
        self.adx_enabled = adx_enabled
        self.adx_threshold = adx_threshold
    
    def calculate_score(self, indicator_signals):
        """
        Calculate the confluence score based on indicator signals.
        
        Args:
            indicator_signals (dict): Dictionary of indicator signals.
                                     Keys should match the weight keys.
                                     Values should be in range [-1, 1] where:
                                     -1 = strong bearish
                                      0 = neutral
                                      1 = strong bullish
        
        Returns:
            float: Confluence score in range [-100, 100]
        """
        score = 0.0
        
        for indicator, weight in self.weights.items():
            if indicator in indicator_signals:
                signal = indicator_signals[indicator]
                # Clamp signal to [-1, 1] range
                signal = max(-1, min(1, signal))
                score += signal * weight
        
        return score
    
    def evaluate_with_adx(self, indicator_signals, adx_value):
        """
        Evaluate confluence score with ADX filtering.
        
        Args:
            indicator_signals (dict): Dictionary of indicator signals
            adx_value (float): Current ADX value
        
        Returns:
            tuple: (score, is_strong_trend)
                  score: Confluence score
                  is_strong_trend: Boolean indicating if ADX exceeds threshold
        """
        score = self.calculate_score(indicator_signals)
        is_strong_trend = adx_value >= self.adx_threshold if self.adx_enabled else True
        
        return score, is_strong_trend
    
    def get_weights(self):
        """
        Get current indicator weights.
        
        Returns:
            dict: Current weights configuration
        """
        return self.weights.copy()
    
    def update_weights(self, new_weights):
        """
        Update indicator weights.
        
        Args:
            new_weights (dict): New weights to apply
        """
        self.weights.update(new_weights)
        
        # Re-normalize to 100
        total_weight = sum(self.weights.values())
        if total_weight != 100:
            self.weights = {k: (v / total_weight) * 100 for k, v in self.weights.items()}
    
    def __repr__(self):
        return f"ConfluenceScorer(weights={self.weights}, adx_enabled={self.adx_enabled}, adx_threshold={self.adx_threshold})"
