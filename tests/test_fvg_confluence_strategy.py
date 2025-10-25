"""
Unit tests for FVG Confluence Strategy
"""

import unittest
import sys
import os

# Add parent directory to path to import strategies module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from strategies.fvg_confluence_strategy import FVGConfluenceStrategy


class TestFVGConfluenceStrategy(unittest.TestCase):
    """Test cases for FVGConfluenceStrategy class"""
    
    def setUp(self):
        """Set up test strategy instance"""
        self.strategy = FVGConfluenceStrategy()
    
    def test_initialization(self):
        """Test that strategy initializes correctly"""
        self.assertIsNotNone(self.strategy.confluence_scorer)
        
        config = self.strategy.get_configuration()
        self.assertEqual(config['weights']['fvg'], 60)
        self.assertEqual(config['weights']['vwap'], 15)
        self.assertEqual(config['weights']['obv'], 15)
        self.assertEqual(config['weights']['volume'], 10)
        self.assertTrue(config['adx_enabled'])
        self.assertEqual(config['adx_threshold'], 25.0)
    
    def test_detect_bullish_fvg(self):
        """Test detection of bullish Fair Value Gap"""
        candles = [
            {'open': 100, 'high': 105, 'low': 98, 'close': 103},   # 2 periods ago
            {'open': 103, 'high': 108, 'low': 102, 'close': 106},  # 1 period ago
            {'open': 110, 'high': 115, 'low': 109, 'close': 112},  # Current (low > 2-back high)
        ]
        
        result = self.strategy.detect_fvg(candles)
        
        self.assertEqual(result['signal'], 1)
        self.assertIsNotNone(result['gap_info'])
        self.assertEqual(result['gap_info']['type'], 'bullish')
        self.assertEqual(result['gap_info']['gap_start'], 105)  # 2-back high
        self.assertEqual(result['gap_info']['gap_end'], 109)    # current low
        self.assertEqual(result['gap_info']['gap_size'], 4)
    
    def test_detect_bearish_fvg(self):
        """Test detection of bearish Fair Value Gap"""
        candles = [
            {'open': 100, 'high': 105, 'low': 98, 'close': 103},   # 2 periods ago
            {'open': 103, 'high': 108, 'low': 102, 'close': 106},  # 1 period ago
            {'open': 95, 'high': 97, 'low': 92, 'close': 94},      # Current (high < 2-back low)
        ]
        
        result = self.strategy.detect_fvg(candles)
        
        self.assertEqual(result['signal'], -1)
        self.assertIsNotNone(result['gap_info'])
        self.assertEqual(result['gap_info']['type'], 'bearish')
        self.assertEqual(result['gap_info']['gap_start'], 97)   # current high
        self.assertEqual(result['gap_info']['gap_end'], 98)     # 2-back low
        self.assertEqual(result['gap_info']['gap_size'], 1)
    
    def test_detect_no_fvg(self):
        """Test when no Fair Value Gap exists"""
        candles = [
            {'open': 100, 'high': 105, 'low': 98, 'close': 103},
            {'open': 103, 'high': 108, 'low': 102, 'close': 106},
            {'open': 104, 'high': 109, 'low': 103, 'close': 107},  # No gap
        ]
        
        result = self.strategy.detect_fvg(candles)
        
        self.assertEqual(result['signal'], 0)
        self.assertIsNone(result['gap_info'])
    
    def test_detect_fvg_insufficient_data(self):
        """Test FVG detection with insufficient candle data"""
        candles = [
            {'open': 100, 'high': 105, 'low': 98, 'close': 103},
        ]
        
        result = self.strategy.detect_fvg(candles)
        
        self.assertEqual(result['signal'], 0)
        self.assertIsNone(result['gap_info'])
    
    def test_calculate_vwap_signal_bullish(self):
        """Test VWAP signal when price is above VWAP"""
        signal = self.strategy.calculate_vwap_signal(price=105, vwap=100)
        self.assertEqual(signal, 1)
    
    def test_calculate_vwap_signal_bearish(self):
        """Test VWAP signal when price is below VWAP"""
        signal = self.strategy.calculate_vwap_signal(price=95, vwap=100)
        self.assertEqual(signal, -1)
    
    def test_calculate_vwap_signal_neutral(self):
        """Test VWAP signal when price equals VWAP"""
        signal = self.strategy.calculate_vwap_signal(price=100, vwap=100)
        self.assertEqual(signal, 0)
    
    def test_calculate_obv_signal_bullish(self):
        """Test OBV signal when OBV is increasing"""
        signal = self.strategy.calculate_obv_signal(obv_current=1000, obv_previous=900)
        self.assertEqual(signal, 1)
    
    def test_calculate_obv_signal_bearish(self):
        """Test OBV signal when OBV is decreasing"""
        signal = self.strategy.calculate_obv_signal(obv_current=900, obv_previous=1000)
        self.assertEqual(signal, -1)
    
    def test_calculate_obv_signal_neutral(self):
        """Test OBV signal when OBV is unchanged"""
        signal = self.strategy.calculate_obv_signal(obv_current=1000, obv_previous=1000)
        self.assertEqual(signal, 0)
    
    def test_calculate_volume_signal_high(self):
        """Test volume signal when volume is high"""
        signal = self.strategy.calculate_volume_signal(volume_current=1600, volume_average=1000)
        self.assertEqual(signal, 1)
    
    def test_calculate_volume_signal_low(self):
        """Test volume signal when volume is low"""
        signal = self.strategy.calculate_volume_signal(volume_current=400, volume_average=1000)
        self.assertEqual(signal, -1)
    
    def test_calculate_volume_signal_neutral(self):
        """Test volume signal when volume is average"""
        signal = self.strategy.calculate_volume_signal(volume_current=1000, volume_average=1000)
        self.assertEqual(signal, 0)
    
    def test_generate_signal_strong_buy(self):
        """Test signal generation for strong buy scenario"""
        market_data = {
            'candles': [
                {'open': 100, 'high': 105, 'low': 98, 'close': 103},
                {'open': 103, 'high': 108, 'low': 102, 'close': 106},
                {'open': 110, 'high': 115, 'low': 109, 'close': 112},  # Bullish FVG
            ],
            'vwap': 105,  # Price above VWAP (bullish)
            'obv_current': 1000,
            'obv_previous': 900,  # OBV increasing (bullish)
            'volume_current': 1600,
            'volume_average': 1000,  # High volume (bullish)
            'adx': 30.0  # Strong trend
        }
        
        result = self.strategy.generate_signal(market_data)
        
        self.assertEqual(result['action'], 'BUY')
        self.assertGreater(result['score'], 50)
        self.assertTrue(result['strong_trend'])
        self.assertEqual(result['components']['fvg'], 1)
        self.assertEqual(result['components']['vwap'], 1)
        self.assertEqual(result['components']['obv'], 1)
        self.assertEqual(result['components']['volume'], 1)
    
    def test_generate_signal_strong_sell(self):
        """Test signal generation for strong sell scenario"""
        market_data = {
            'candles': [
                {'open': 100, 'high': 105, 'low': 98, 'close': 103},
                {'open': 103, 'high': 108, 'low': 102, 'close': 106},
                {'open': 95, 'high': 97, 'low': 92, 'close': 94},  # Bearish FVG
            ],
            'vwap': 100,  # Price below VWAP (bearish)
            'obv_current': 800,
            'obv_previous': 900,  # OBV decreasing (bearish)
            'volume_current': 1600,
            'volume_average': 1000,  # High volume (confirming)
            'adx': 30.0  # Strong trend
        }
        
        result = self.strategy.generate_signal(market_data)
        
        self.assertEqual(result['action'], 'SELL')
        self.assertLess(result['score'], -50)
        self.assertTrue(result['strong_trend'])
    
    def test_generate_signal_hold_weak_trend(self):
        """Test signal generation when trend is weak (low ADX)"""
        market_data = {
            'candles': [
                {'open': 100, 'high': 105, 'low': 98, 'close': 103},
                {'open': 103, 'high': 108, 'low': 102, 'close': 106},
                {'open': 110, 'high': 115, 'low': 109, 'close': 112},  # Bullish FVG
            ],
            'vwap': 105,
            'obv_current': 1000,
            'obv_previous': 900,
            'volume_current': 1600,
            'volume_average': 1000,
            'adx': 20.0  # Weak trend (below threshold)
        }
        
        result = self.strategy.generate_signal(market_data)
        
        # Even with good score, should HOLD due to weak trend
        self.assertEqual(result['action'], 'HOLD')
        self.assertFalse(result['strong_trend'])
    
    def test_generate_signal_hold_neutral(self):
        """Test signal generation for neutral scenario"""
        market_data = {
            'candles': [
                {'open': 100, 'high': 105, 'low': 98, 'close': 103},
                {'open': 103, 'high': 108, 'low': 102, 'close': 106},
                {'open': 104, 'high': 109, 'low': 103, 'close': 107},  # No FVG
            ],
            'vwap': 107,  # Price = VWAP
            'obv_current': 900,
            'obv_previous': 900,  # OBV unchanged
            'volume_current': 1000,
            'volume_average': 1000,  # Normal volume
            'adx': 30.0
        }
        
        result = self.strategy.generate_signal(market_data)
        
        self.assertEqual(result['action'], 'HOLD')
        self.assertAlmostEqual(result['score'], 0, delta=50)
    
    def test_generate_signal_without_adx(self):
        """Test signal generation when ADX is not provided"""
        market_data = {
            'candles': [
                {'open': 100, 'high': 105, 'low': 98, 'close': 103},
                {'open': 103, 'high': 108, 'low': 102, 'close': 106},
                {'open': 110, 'high': 115, 'low': 109, 'close': 112},
            ],
            'vwap': 105,
            'obv_current': 1000,
            'obv_previous': 900,
            'volume_current': 1600,
            'volume_average': 1000,
            # No ADX provided
        }
        
        result = self.strategy.generate_signal(market_data)
        
        # Should still work, defaulting strong_trend to True
        self.assertIn(result['action'], ['BUY', 'SELL', 'HOLD'])
        self.assertTrue(result['strong_trend'])


if __name__ == '__main__':
    unittest.main()
