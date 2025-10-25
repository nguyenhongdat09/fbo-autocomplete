"""
FVG (Fair Value Gap) Confluence Strategy

This strategy combines Fair Value Gap analysis with multiple technical indicators
using a weighted confluence scoring system.
"""

from .confluence_scorer import ConfluenceScorer


class FVGConfluenceStrategy:
    """
    A trading strategy that uses Fair Value Gap (FVG) detection combined with
    confluence of multiple technical indicators.
    
    Fair Value Gaps are price gaps in the market that represent imbalances between
    buyers and sellers. This strategy identifies these gaps and confirms them using
    additional technical indicators (VWAP, OBV, Volume, ADX).
    """
    
    def __init__(self):
        """
        Initialize the FVG Confluence Strategy.
        """
        self.confluence_scorer = None
        self._setup_confluence_scorer()
    
    def _setup_confluence_scorer(self):
        """
        Configure the confluence scorer with custom weights for each indicator.
        
        Weights explanation:
        - fvg (60): Fair Value Gap gets the highest weight as it's the primary signal
        - vwap (15): VWAP (Volume Weighted Average Price) provides trend confirmation
        - obv (15): OBV (On Balance Volume) validates volume flow
        - volume (10): Raw volume confirms market participation
        
        ADX (Average Directional Index) is used as a trend strength filter:
        - adx_enabled=True: Activates ADX filtering
        - adx_threshold=25.0: Minimum ADX value to consider the trend strong enough
          (Values above 25 typically indicate a trending market)
        """
        # Thay đổi weights
        weights = {
            'fvg': 60,      # Tăng FVG weight (Increase FVG weight)
            'vwap': 15,     # Giảm VWAP weight (Decrease VWAP weight)
            'obv': 15,      # OBV weight
            'volume': 10,   # Volume weight
        }

        self.confluence_scorer = ConfluenceScorer(
            weights=weights,
            adx_enabled=True,
            adx_threshold=25.0  # Thay đổi ADX threshold (Change ADX threshold)
        )
    
    def detect_fvg(self, candles):
        """
        Detect Fair Value Gaps in price data.
        
        A Fair Value Gap occurs when:
        - Bullish FVG: The low of current candle is above the high of the candle 2 periods ago
        - Bearish FVG: The high of current candle is below the low of the candle 2 periods ago
        
        Args:
            candles (list): List of candle data (OHLC format)
                          Each candle should be a dict with 'open', 'high', 'low', 'close'
        
        Returns:
            dict: FVG detection result with 'signal' (-1 to 1) and 'gap_info'
        """
        if len(candles) < 3:
            return {'signal': 0, 'gap_info': None}
        
        current = candles[-1]
        previous = candles[-2]
        two_back = candles[-3]
        
        # Check for bullish FVG
        if current['low'] > two_back['high']:
            gap_size = current['low'] - two_back['high']
            return {
                'signal': 1,
                'gap_info': {
                    'type': 'bullish',
                    'gap_start': two_back['high'],
                    'gap_end': current['low'],
                    'gap_size': gap_size
                }
            }
        
        # Check for bearish FVG
        if current['high'] < two_back['low']:
            gap_size = two_back['low'] - current['high']
            return {
                'signal': -1,
                'gap_info': {
                    'type': 'bearish',
                    'gap_start': current['high'],
                    'gap_end': two_back['low'],
                    'gap_size': gap_size
                }
            }
        
        return {'signal': 0, 'gap_info': None}
    
    def calculate_vwap_signal(self, price, vwap):
        """
        Calculate VWAP signal.
        
        Args:
            price (float): Current price
            vwap (float): Current VWAP value
        
        Returns:
            float: Signal in range [-1, 1]
        """
        if price > vwap:
            return 1  # Bullish: price above VWAP
        elif price < vwap:
            return -1  # Bearish: price below VWAP
        return 0
    
    def calculate_obv_signal(self, obv_current, obv_previous):
        """
        Calculate OBV (On Balance Volume) signal.
        
        Args:
            obv_current (float): Current OBV value
            obv_previous (float): Previous OBV value
        
        Returns:
            float: Signal in range [-1, 1]
        """
        if obv_current > obv_previous:
            return 1  # Bullish: OBV increasing
        elif obv_current < obv_previous:
            return -1  # Bearish: OBV decreasing
        return 0
    
    def calculate_volume_signal(self, volume_current, volume_average):
        """
        Calculate volume signal.
        
        Args:
            volume_current (float): Current volume
            volume_average (float): Average volume
        
        Returns:
            float: Signal in range [-1, 1]
        """
        ratio = volume_current / volume_average if volume_average > 0 else 1
        
        if ratio > 1.5:
            return 1  # High volume
        elif ratio < 0.5:
            return -1  # Low volume
        return 0
    
    def generate_signal(self, market_data):
        """
        Generate trading signal based on confluence of all indicators.
        
        Args:
            market_data (dict): Dictionary containing:
                - 'candles': List of OHLC candle data
                - 'vwap': Current VWAP value
                - 'obv_current': Current OBV value
                - 'obv_previous': Previous OBV value
                - 'volume_current': Current volume
                - 'volume_average': Average volume
                - 'adx': Current ADX value (optional if adx_enabled=False)
        
        Returns:
            dict: Trading signal with:
                - 'action': 'BUY', 'SELL', or 'HOLD'
                - 'score': Confluence score
                - 'strong_trend': Boolean indicating if ADX confirms strong trend
                - 'components': Individual indicator signals
        """
        # Calculate individual indicator signals
        fvg_result = self.detect_fvg(market_data['candles'])
        
        indicator_signals = {
            'fvg': fvg_result['signal'],
            'vwap': self.calculate_vwap_signal(
                market_data['candles'][-1]['close'],
                market_data['vwap']
            ),
            'obv': self.calculate_obv_signal(
                market_data['obv_current'],
                market_data['obv_previous']
            ),
            'volume': self.calculate_volume_signal(
                market_data['volume_current'],
                market_data['volume_average']
            )
        }
        
        # Calculate confluence score
        if self.confluence_scorer.adx_enabled and 'adx' in market_data:
            score, strong_trend = self.confluence_scorer.evaluate_with_adx(
                indicator_signals,
                market_data['adx']
            )
        else:
            score = self.confluence_scorer.calculate_score(indicator_signals)
            strong_trend = True
        
        # Determine action based on score
        action = 'HOLD'
        if score > 50 and strong_trend:
            action = 'BUY'
        elif score < -50 and strong_trend:
            action = 'SELL'
        
        return {
            'action': action,
            'score': score,
            'strong_trend': strong_trend,
            'components': indicator_signals,
            'fvg_gap_info': fvg_result['gap_info']
        }
    
    def get_configuration(self):
        """
        Get current strategy configuration.
        
        Returns:
            dict: Configuration including weights and parameters
        """
        return {
            'weights': self.confluence_scorer.get_weights(),
            'adx_enabled': self.confluence_scorer.adx_enabled,
            'adx_threshold': self.confluence_scorer.adx_threshold
        }
    
    def __repr__(self):
        return f"FVGConfluenceStrategy(scorer={self.confluence_scorer})"
