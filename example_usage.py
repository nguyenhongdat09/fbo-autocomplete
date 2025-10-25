#!/usr/bin/env python3
"""
Example usage of FVG Confluence Strategy

This script demonstrates how to use the FVGConfluenceStrategy class
to generate trading signals based on market data.
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from strategies.fvg_confluence_strategy import FVGConfluenceStrategy


def main():
    print("=" * 70)
    print("FVG Confluence Strategy - Example Usage")
    print("=" * 70)
    
    # Initialize the strategy
    strategy = FVGConfluenceStrategy()
    
    # Display configuration
    config = strategy.get_configuration()
    print("\nStrategy Configuration:")
    print("-" * 70)
    print(f"Weights: {config['weights']}")
    print(f"ADX Enabled: {config['adx_enabled']}")
    print(f"ADX Threshold: {config['adx_threshold']}")
    
    # Example 1: Strong Bullish Signal
    print("\n" + "=" * 70)
    print("Example 1: Strong Bullish Signal")
    print("=" * 70)
    
    market_data_bullish = {
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
        'adx': 30.0
    }
    
    signal = strategy.generate_signal(market_data_bullish)
    print_signal(signal)
    
    # Example 2: Strong Bearish Signal
    print("\n" + "=" * 70)
    print("Example 2: Strong Bearish Signal")
    print("=" * 70)
    
    market_data_bearish = {
        'candles': [
            {'open': 100, 'high': 105, 'low': 98, 'close': 103},
            {'open': 103, 'high': 108, 'low': 102, 'close': 106},
            {'open': 95, 'high': 97, 'low': 92, 'close': 94},  # Bearish FVG
        ],
        'vwap': 100,
        'obv_current': 800,
        'obv_previous': 900,
        'volume_current': 1600,
        'volume_average': 1000,
        'adx': 30.0
    }
    
    signal = strategy.generate_signal(market_data_bearish)
    print_signal(signal)
    
    # Example 3: Hold Signal (Weak Trend)
    print("\n" + "=" * 70)
    print("Example 3: Hold Signal (Weak Trend - Low ADX)")
    print("=" * 70)
    
    market_data_weak = {
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
        'adx': 20.0  # Weak trend
    }
    
    signal = strategy.generate_signal(market_data_weak)
    print_signal(signal)
    
    # Example 4: Neutral Signal
    print("\n" + "=" * 70)
    print("Example 4: Neutral/Hold Signal (No Clear Pattern)")
    print("=" * 70)
    
    market_data_neutral = {
        'candles': [
            {'open': 100, 'high': 105, 'low': 98, 'close': 103},
            {'open': 103, 'high': 108, 'low': 102, 'close': 106},
            {'open': 104, 'high': 109, 'low': 103, 'close': 107},  # No FVG
        ],
        'vwap': 107,
        'obv_current': 900,
        'obv_previous': 900,
        'volume_current': 1000,
        'volume_average': 1000,
        'adx': 30.0
    }
    
    signal = strategy.generate_signal(market_data_neutral)
    print_signal(signal)
    
    print("\n" + "=" * 70)
    print("Examples completed successfully!")
    print("=" * 70)


def print_signal(signal):
    """Print signal information in a formatted way"""
    print(f"\nAction: {signal['action']}")
    print(f"Confluence Score: {signal['score']:.2f}")
    print(f"Strong Trend (ADX): {signal['strong_trend']}")
    
    print("\nComponent Signals:")
    for component, value in signal['components'].items():
        symbol = "+" if value > 0 else ("-" if value < 0 else "=")
        print(f"  {component.upper():8s}: {symbol} ({value:+.1f})")
    
    if signal['fvg_gap_info']:
        gap_info = signal['fvg_gap_info']
        print(f"\nFVG Details:")
        print(f"  Type: {gap_info['type']}")
        print(f"  Gap Start: {gap_info['gap_start']}")
        print(f"  Gap End: {gap_info['gap_end']}")
        print(f"  Gap Size: {gap_info['gap_size']}")
    else:
        print("\nNo Fair Value Gap detected")
    
    print("\nRecommendation:")
    if signal['action'] == 'BUY':
        print("  ✓ Consider entering a LONG position")
    elif signal['action'] == 'SELL':
        print("  ✓ Consider entering a SHORT position")
    else:
        print("  ○ HOLD - Wait for better opportunity")


if __name__ == '__main__':
    main()
