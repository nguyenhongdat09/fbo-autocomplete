"""
Unit tests for Confluence Scorer
"""

import unittest
import sys
import os

# Add parent directory to path to import strategies module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from strategies.confluence_scorer import ConfluenceScorer


class TestConfluenceScorer(unittest.TestCase):
    """Test cases for ConfluenceScorer class"""
    
    def test_initialization_with_default_weights(self):
        """Test that scorer initializes correctly with default weights"""
        scorer = ConfluenceScorer()
        weights = scorer.get_weights()
        
        self.assertIn('fvg', weights)
        self.assertIn('vwap', weights)
        self.assertIn('obv', weights)
        self.assertIn('volume', weights)
        
        # Check that weights sum to 100
        total = sum(weights.values())
        self.assertAlmostEqual(total, 100.0, places=2)
    
    def test_initialization_with_custom_weights(self):
        """Test initialization with custom weights"""
        custom_weights = {
            'fvg': 60,
            'vwap': 15,
            'obv': 15,
            'volume': 10,
        }
        
        scorer = ConfluenceScorer(weights=custom_weights)
        weights = scorer.get_weights()
        
        self.assertEqual(weights['fvg'], 60)
        self.assertEqual(weights['vwap'], 15)
        self.assertEqual(weights['obv'], 15)
        self.assertEqual(weights['volume'], 10)
    
    def test_weight_normalization(self):
        """Test that weights are normalized to sum to 100"""
        # Weights that don't sum to 100
        custom_weights = {
            'fvg': 30,
            'vwap': 20,
            'obv': 20,
            'volume': 10,
        }  # Sum = 80
        
        scorer = ConfluenceScorer(weights=custom_weights)
        weights = scorer.get_weights()
        
        # Should be normalized to sum to 100
        total = sum(weights.values())
        self.assertAlmostEqual(total, 100.0, places=2)
        
        # Proportions should be maintained
        self.assertAlmostEqual(weights['fvg'], 37.5, places=1)  # 30/80 * 100
        self.assertAlmostEqual(weights['vwap'], 25.0, places=1)  # 20/80 * 100
    
    def test_calculate_score_all_bullish(self):
        """Test score calculation with all bullish signals"""
        scorer = ConfluenceScorer()
        
        signals = {
            'fvg': 1,
            'vwap': 1,
            'obv': 1,
            'volume': 1,
        }
        
        score = scorer.calculate_score(signals)
        self.assertEqual(score, 100.0)
    
    def test_calculate_score_all_bearish(self):
        """Test score calculation with all bearish signals"""
        scorer = ConfluenceScorer()
        
        signals = {
            'fvg': -1,
            'vwap': -1,
            'obv': -1,
            'volume': -1,
        }
        
        score = scorer.calculate_score(signals)
        self.assertEqual(score, -100.0)
    
    def test_calculate_score_neutral(self):
        """Test score calculation with neutral signals"""
        scorer = ConfluenceScorer()
        
        signals = {
            'fvg': 0,
            'vwap': 0,
            'obv': 0,
            'volume': 0,
        }
        
        score = scorer.calculate_score(signals)
        self.assertEqual(score, 0.0)
    
    def test_calculate_score_mixed_signals(self):
        """Test score calculation with mixed signals"""
        custom_weights = {
            'fvg': 60,
            'vwap': 15,
            'obv': 15,
            'volume': 10,
        }
        scorer = ConfluenceScorer(weights=custom_weights)
        
        signals = {
            'fvg': 1,      # +60
            'vwap': -1,    # -15
            'obv': 1,      # +15
            'volume': 0,   # 0
        }
        
        score = scorer.calculate_score(signals)
        self.assertEqual(score, 60.0)  # 60 - 15 + 15 + 0
    
    def test_evaluate_with_adx_above_threshold(self):
        """Test ADX evaluation when value is above threshold"""
        scorer = ConfluenceScorer(adx_enabled=True, adx_threshold=25.0)
        
        signals = {
            'fvg': 1,
            'vwap': 1,
            'obv': 1,
            'volume': 1,
        }
        
        score, is_strong_trend = scorer.evaluate_with_adx(signals, 30.0)
        
        self.assertEqual(score, 100.0)
        self.assertTrue(is_strong_trend)
    
    def test_evaluate_with_adx_below_threshold(self):
        """Test ADX evaluation when value is below threshold"""
        scorer = ConfluenceScorer(adx_enabled=True, adx_threshold=25.0)
        
        signals = {
            'fvg': 1,
            'vwap': 1,
            'obv': 1,
            'volume': 1,
        }
        
        score, is_strong_trend = scorer.evaluate_with_adx(signals, 20.0)
        
        self.assertEqual(score, 100.0)
        self.assertFalse(is_strong_trend)
    
    def test_evaluate_with_adx_disabled(self):
        """Test that ADX is ignored when disabled"""
        scorer = ConfluenceScorer(adx_enabled=False, adx_threshold=25.0)
        
        signals = {
            'fvg': 1,
            'vwap': 1,
            'obv': 1,
            'volume': 1,
        }
        
        # Even with low ADX, should return True because ADX is disabled
        score, is_strong_trend = scorer.evaluate_with_adx(signals, 10.0)
        
        self.assertEqual(score, 100.0)
        self.assertTrue(is_strong_trend)
    
    def test_update_weights(self):
        """Test updating weights after initialization"""
        scorer = ConfluenceScorer()
        
        new_weights = {
            'fvg': 70,
            'vwap': 10,
        }
        
        scorer.update_weights(new_weights)
        weights = scorer.get_weights()
        
        # Should be normalized
        total = sum(weights.values())
        self.assertAlmostEqual(total, 100.0, places=2)
    
    def test_signal_clamping(self):
        """Test that signals are clamped to [-1, 1] range"""
        scorer = ConfluenceScorer()
        
        # Signals outside valid range
        signals = {
            'fvg': 2.0,      # Should be clamped to 1
            'vwap': -2.0,    # Should be clamped to -1
            'obv': 0.5,
            'volume': -0.5,
        }
        
        score = scorer.calculate_score(signals)
        
        # With default weights (40, 20, 20, 20), clamped signals would give:
        # 1*40 + (-1)*20 + 0.5*20 + (-0.5)*20 = 40 - 20 + 10 - 10 = 20
        self.assertAlmostEqual(score, 20.0, places=1)


if __name__ == '__main__':
    unittest.main()
