export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_common_settings: {
        Row: {
          apply_ids: string[]
          apply_scope: string
          columns_ids: string[]
          columns_scope: string
          common_columns: Json | null
          common_filters: Json
          hide_per_sector_save: boolean
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          apply_ids?: string[]
          apply_scope?: string
          columns_ids?: string[]
          columns_scope?: string
          common_columns?: Json | null
          common_filters?: Json
          hide_per_sector_save?: boolean
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          apply_ids?: string[]
          apply_scope?: string
          columns_ids?: string[]
          columns_scope?: string
          common_columns?: Json | null
          common_filters?: Json
          hide_per_sector_save?: boolean
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      admin_preset_overrides: {
        Row: {
          columns: Json | null
          filters: Json | null
          group_name: string | null
          hidden: boolean
          is_default: boolean
          preset_id: string
          unlocked: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          columns?: Json | null
          filters?: Json | null
          group_name?: string | null
          hidden?: boolean
          is_default?: boolean
          preset_id: string
          unlocked?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          columns?: Json | null
          filters?: Json | null
          group_name?: string | null
          hidden?: boolean
          is_default?: boolean
          preset_id?: string
          unlocked?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      band_watchlist: {
        Row: {
          added_at: string
          created_at: string
          id: string
          notes: string | null
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          added_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          added_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      breadth_daily: {
        Row: {
          above_ema200: number
          above_ema50: number
          day: string
          down_25pct_1m: number
          down_25pct_1q: number
          down_4pct: number
          near_52w_high_2pct: number
          near_52w_low_2pct: number
          near_ath_5pct: number
          new_ath: number
          new_highs_52w: number
          new_lows_52w: number
          t2108: number | null
          total: number
          ts: string
          up_25pct_1m: number
          up_25pct_1q: number
          up_4pct: number
        }
        Insert: {
          above_ema200?: number
          above_ema50?: number
          day: string
          down_25pct_1m?: number
          down_25pct_1q?: number
          down_4pct?: number
          near_52w_high_2pct?: number
          near_52w_low_2pct?: number
          near_ath_5pct?: number
          new_ath?: number
          new_highs_52w?: number
          new_lows_52w?: number
          t2108?: number | null
          total?: number
          ts?: string
          up_25pct_1m?: number
          up_25pct_1q?: number
          up_4pct?: number
        }
        Update: {
          above_ema200?: number
          above_ema50?: number
          day?: string
          down_25pct_1m?: number
          down_25pct_1q?: number
          down_4pct?: number
          near_52w_high_2pct?: number
          near_52w_low_2pct?: number
          near_ath_5pct?: number
          new_ath?: number
          new_highs_52w?: number
          new_lows_52w?: number
          t2108?: number | null
          total?: number
          ts?: string
          up_25pct_1m?: number
          up_25pct_1q?: number
          up_4pct?: number
        }
        Relationships: []
      }
      bulk_block_deals: {
        Row: {
          client_name: string | null
          created_at: string
          deal_date: string
          deal_type: string | null
          id: string
          price: number | null
          quantity: number | null
          source: string
          symbol: string
        }
        Insert: {
          client_name?: string | null
          created_at?: string
          deal_date: string
          deal_type?: string | null
          id?: string
          price?: number | null
          quantity?: number | null
          source?: string
          symbol: string
        }
        Update: {
          client_name?: string | null
          created_at?: string
          deal_date?: string
          deal_type?: string | null
          id?: string
          price?: number | null
          quantity?: number | null
          source?: string
          symbol?: string
        }
        Relationships: []
      }
      circuit_band_changes: {
        Row: {
          created_at: string
          detected_at: string
          digested: boolean
          id: number
          new_band: string | null
          new_band_pct: number | null
          notified: boolean
          old_band: string | null
          old_band_pct: number | null
          symbol: string
        }
        Insert: {
          created_at?: string
          detected_at?: string
          digested?: boolean
          id?: number
          new_band?: string | null
          new_band_pct?: number | null
          notified?: boolean
          old_band?: string | null
          old_band_pct?: number | null
          symbol: string
        }
        Update: {
          created_at?: string
          detected_at?: string
          digested?: boolean
          id?: number
          new_band?: string | null
          new_band_pct?: number | null
          notified?: boolean
          old_band?: string | null
          old_band_pct?: number | null
          symbol?: string
        }
        Relationships: []
      }
      circuit_bands_history: {
        Row: {
          band: string | null
          band_pct: number | null
          created_at: string
          fetched_at: string
          id: number
          snapshot_date: string
          symbol: string
        }
        Insert: {
          band?: string | null
          band_pct?: number | null
          created_at?: string
          fetched_at?: string
          id?: number
          snapshot_date?: string
          symbol: string
        }
        Update: {
          band?: string | null
          band_pct?: number | null
          created_at?: string
          fetched_at?: string
          id?: number
          snapshot_date?: string
          symbol?: string
        }
        Relationships: []
      }
      custom_reminders: {
        Row: {
          body: string
          created_at: string
          enabled: boolean
          id: string
          last_sent_at: string | null
          repeat_minutes: number | null
          repeat_until: string | null
          send_at: string
          sent_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          repeat_minutes?: number | null
          repeat_until?: string | null
          send_at: string
          sent_at?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_sent_at?: string | null
          repeat_minutes?: number | null
          repeat_until?: string | null
          send_at?: string
          sent_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_prices: {
        Row: {
          close: number | null
          high: number | null
          low: number | null
          open: number | null
          prev_close: number | null
          symbol: string
          trade_date: string
          turnover: number | null
          updated_at: string
          volume: number | null
        }
        Insert: {
          close?: number | null
          high?: number | null
          low?: number | null
          open?: number | null
          prev_close?: number | null
          symbol: string
          trade_date: string
          turnover?: number | null
          updated_at?: string
          volume?: number | null
        }
        Update: {
          close?: number | null
          high?: number | null
          low?: number | null
          open?: number | null
          prev_close?: number | null
          symbol?: string
          trade_date?: string
          turnover?: number | null
          updated_at?: string
          volume?: number | null
        }
        Relationships: []
      }
      data_ingest_status: {
        Row: {
          attempts: number
          completed_at: string | null
          expected_date: string | null
          fetched_date: string | null
          id: string
          last_attempt_at: string | null
          message: string | null
          missing_symbols: string[]
          rows_ingested: number
          status: string
          symbols_checked: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          expected_date?: string | null
          fetched_date?: string | null
          id: string
          last_attempt_at?: string | null
          message?: string | null
          missing_symbols?: string[]
          rows_ingested?: number
          status?: string
          symbols_checked?: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          expected_date?: string | null
          fetched_date?: string | null
          id?: string
          last_attempt_at?: string | null
          message?: string | null
          missing_symbols?: string[]
          rows_ingested?: number
          status?: string
          symbols_checked?: number
          updated_at?: string
        }
        Relationships: []
      }
      index_prices: {
        Row: {
          close: number
          high: number | null
          index_name: string
          low: number | null
          open: number | null
          symbol: string
          trade_date: string
          updated_at: string
          volume: number | null
        }
        Insert: {
          close: number
          high?: number | null
          index_name: string
          low?: number | null
          open?: number | null
          symbol: string
          trade_date: string
          updated_at?: string
          volume?: number | null
        }
        Update: {
          close?: number
          high?: number | null
          index_name?: string
          low?: number | null
          open?: number | null
          symbol?: string
          trade_date?: string
          updated_at?: string
          volume?: number | null
        }
        Relationships: []
      }
      journal_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          period_end: string
          period_start: string
          period_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          period_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          period_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      market_breadth_daily: {
        Row: {
          circuit_excluded: number
          computed_at: string
          down25pct_month_count: number
          down25pct_quarter_count: number
          down4pct_count: number
          history_days: number
          liquidity_excluded: number
          momentum_burst_5day_count: number
          new_52w_highs: number
          new_52w_lows: number
          nifty_close: number | null
          pct_above_50dma: number | null
          trade_date: string
          universe_count: number
          up25pct_month_count: number
          up25pct_quarter_count: number
          up4pct_count: number
          up4pct_ratio_10day: number | null
          up4pct_ratio_5day: number | null
          up50pct_month_count: number
          up50pct_quarter_count: number
        }
        Insert: {
          circuit_excluded?: number
          computed_at?: string
          down25pct_month_count?: number
          down25pct_quarter_count?: number
          down4pct_count?: number
          history_days?: number
          liquidity_excluded?: number
          momentum_burst_5day_count?: number
          new_52w_highs?: number
          new_52w_lows?: number
          nifty_close?: number | null
          pct_above_50dma?: number | null
          trade_date: string
          universe_count?: number
          up25pct_month_count?: number
          up25pct_quarter_count?: number
          up4pct_count?: number
          up4pct_ratio_10day?: number | null
          up4pct_ratio_5day?: number | null
          up50pct_month_count?: number
          up50pct_quarter_count?: number
        }
        Update: {
          circuit_excluded?: number
          computed_at?: string
          down25pct_month_count?: number
          down25pct_quarter_count?: number
          down4pct_count?: number
          history_days?: number
          liquidity_excluded?: number
          momentum_burst_5day_count?: number
          new_52w_highs?: number
          new_52w_lows?: number
          nifty_close?: number | null
          pct_above_50dma?: number | null
          trade_date?: string
          universe_count?: number
          up25pct_month_count?: number
          up25pct_quarter_count?: number
          up4pct_count?: number
          up4pct_ratio_10day?: number | null
          up4pct_ratio_5day?: number | null
          up50pct_month_count?: number
          up50pct_quarter_count?: number
        }
        Relationships: []
      }
      nifty500_constituents: {
        Row: {
          company: string | null
          industry: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          industry?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          industry?: string | null
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      preset_groups: {
        Row: {
          created_at: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      price_alerts: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          kind: string
          last_message: string | null
          last_state: boolean | null
          last_triggered_at: string | null
          left_field: string
          note: string | null
          operator: string
          params: Json
          repeat_alert: boolean
          right_field: string
          right_value: number | null
          symbol: string
          timeframe: string
          times_triggered: number
          tolerance_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          last_message?: string | null
          last_state?: boolean | null
          last_triggered_at?: string | null
          left_field?: string
          note?: string | null
          operator?: string
          params?: Json
          repeat_alert?: boolean
          right_field?: string
          right_value?: number | null
          symbol: string
          timeframe?: string
          times_triggered?: number
          tolerance_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          last_message?: string | null
          last_state?: boolean | null
          last_triggered_at?: string | null
          left_field?: string
          note?: string | null
          operator?: string
          params?: Json
          repeat_alert?: boolean
          right_field?: string
          right_value?: number | null
          symbol?: string
          timeframe?: string
          times_triggered?: number
          tolerance_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      price_band_fetch_log: {
        Row: {
          id: number
          last_attempt_at: string
          last_attempt_status: string
          last_successful_fetch: string | null
          row_count: number
        }
        Insert: {
          id?: number
          last_attempt_at?: string
          last_attempt_status?: string
          last_successful_fetch?: string | null
          row_count?: number
        }
        Update: {
          id?: number
          last_attempt_at?: string
          last_attempt_status?: string
          last_successful_fetch?: string | null
          row_count?: number
        }
        Relationships: []
      }
      price_bands: {
        Row: {
          band: string | null
          band_pct: number | null
          effective_date: string
          remarks: string | null
          security_name: string | null
          series: string | null
          source_date: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          band?: string | null
          band_pct?: number | null
          effective_date: string
          remarks?: string | null
          security_name?: string | null
          series?: string | null
          source_date?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          band?: string | null
          band_pct?: number | null
          effective_date?: string
          remarks?: string | null
          security_name?: string | null
          series?: string | null
          source_date?: string | null
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_snapshot: {
        Row: {
          adr_20: number | null
          ath: number | null
          avg_price_30d: number | null
          avg_turnover_30d: number | null
          avg_vol_10d: number | null
          avg_vol_30d: number | null
          change_pct: number | null
          day_low: number | null
          dividend_yield: number | null
          earnings_release_date: string | null
          earnings_release_price: number | null
          ema10: number | null
          ema100: number | null
          ema20: number | null
          ema200: number | null
          ema50: number | null
          exchange: string
          first_trade_date: string | null
          high_52w: number | null
          liquidity: number | null
          low_52w: number | null
          market_cap: number | null
          max_vol_252d: number | null
          max_vol_63d: number | null
          max_vol_all: number | null
          max_vol_all_age_days: number | null
          name: string | null
          net_profit_qoq: number | null
          net_profit_yoy: number | null
          open: number | null
          pct_from_52w_high: number | null
          pct_from_52w_low: number | null
          pe_ratio: number | null
          perf_1d: number | null
          perf_1m: number | null
          perf_1w: number | null
          perf_1y: number | null
          perf_3m: number | null
          perf_6m: number | null
          perf_ytd: number | null
          prev_close: number | null
          prev_week_close: number | null
          price: number | null
          rel_vol: number | null
          rs_rating: number | null
          rs_rating_n100: number | null
          rs_rating_n200: number | null
          rs_rating_n50: number | null
          rs_rating_n500: number | null
          rs_score_raw: number | null
          rsi14: number | null
          sales_qoq: number | null
          sales_yoy: number | null
          sector: string | null
          symbol: string
          ticker: string
          updated_at: string
          volume: number | null
          week_gap_pct: number | null
          week_low: number | null
          week_open: number | null
        }
        Insert: {
          adr_20?: number | null
          ath?: number | null
          avg_price_30d?: number | null
          avg_turnover_30d?: number | null
          avg_vol_10d?: number | null
          avg_vol_30d?: number | null
          change_pct?: number | null
          day_low?: number | null
          dividend_yield?: number | null
          earnings_release_date?: string | null
          earnings_release_price?: number | null
          ema10?: number | null
          ema100?: number | null
          ema20?: number | null
          ema200?: number | null
          ema50?: number | null
          exchange?: string
          first_trade_date?: string | null
          high_52w?: number | null
          liquidity?: number | null
          low_52w?: number | null
          market_cap?: number | null
          max_vol_252d?: number | null
          max_vol_63d?: number | null
          max_vol_all?: number | null
          max_vol_all_age_days?: number | null
          name?: string | null
          net_profit_qoq?: number | null
          net_profit_yoy?: number | null
          open?: number | null
          pct_from_52w_high?: number | null
          pct_from_52w_low?: number | null
          pe_ratio?: number | null
          perf_1d?: number | null
          perf_1m?: number | null
          perf_1w?: number | null
          perf_1y?: number | null
          perf_3m?: number | null
          perf_6m?: number | null
          perf_ytd?: number | null
          prev_close?: number | null
          prev_week_close?: number | null
          price?: number | null
          rel_vol?: number | null
          rs_rating?: number | null
          rs_rating_n100?: number | null
          rs_rating_n200?: number | null
          rs_rating_n50?: number | null
          rs_rating_n500?: number | null
          rs_score_raw?: number | null
          rsi14?: number | null
          sales_qoq?: number | null
          sales_yoy?: number | null
          sector?: string | null
          symbol: string
          ticker: string
          updated_at?: string
          volume?: number | null
          week_gap_pct?: number | null
          week_low?: number | null
          week_open?: number | null
        }
        Update: {
          adr_20?: number | null
          ath?: number | null
          avg_price_30d?: number | null
          avg_turnover_30d?: number | null
          avg_vol_10d?: number | null
          avg_vol_30d?: number | null
          change_pct?: number | null
          day_low?: number | null
          dividend_yield?: number | null
          earnings_release_date?: string | null
          earnings_release_price?: number | null
          ema10?: number | null
          ema100?: number | null
          ema20?: number | null
          ema200?: number | null
          ema50?: number | null
          exchange?: string
          first_trade_date?: string | null
          high_52w?: number | null
          liquidity?: number | null
          low_52w?: number | null
          market_cap?: number | null
          max_vol_252d?: number | null
          max_vol_63d?: number | null
          max_vol_all?: number | null
          max_vol_all_age_days?: number | null
          name?: string | null
          net_profit_qoq?: number | null
          net_profit_yoy?: number | null
          open?: number | null
          pct_from_52w_high?: number | null
          pct_from_52w_low?: number | null
          pe_ratio?: number | null
          perf_1d?: number | null
          perf_1m?: number | null
          perf_1w?: number | null
          perf_1y?: number | null
          perf_3m?: number | null
          perf_6m?: number | null
          perf_ytd?: number | null
          prev_close?: number | null
          prev_week_close?: number | null
          price?: number | null
          rel_vol?: number | null
          rs_rating?: number | null
          rs_rating_n100?: number | null
          rs_rating_n200?: number | null
          rs_rating_n50?: number | null
          rs_rating_n500?: number | null
          rs_score_raw?: number | null
          rsi14?: number | null
          sales_qoq?: number | null
          sales_yoy?: number | null
          sector?: string | null
          symbol?: string
          ticker?: string
          updated_at?: string
          volume?: number | null
          week_gap_pct?: number | null
          week_low?: number | null
          week_open?: number | null
        }
        Relationships: []
      }
      trades: {
        Row: {
          created_at: string
          entry_at: string
          entry_price: number
          exit_at: string | null
          exit_price: number | null
          id: string
          notes: string | null
          outcome: string | null
          quantity: number
          rationale: string | null
          setup: string | null
          status: string
          symbol: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_at: string
          entry_price: number
          exit_at?: string | null
          exit_price?: number | null
          id?: string
          notes?: string | null
          outcome?: string | null
          quantity: number
          rationale?: string | null
          setup?: string | null
          status?: string
          symbol: string
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_at?: string
          entry_price?: number
          exit_at?: string | null
          exit_price?: number | null
          id?: string
          notes?: string | null
          outcome?: string | null
          quantity?: number
          rationale?: string | null
          setup?: string | null
          status?: string
          symbol?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_data: {
        Row: {
          alert_sound: boolean | null
          alerts: Json | null
          chart_cfg: Json | null
          indicators: Json | null
          last_list_id: string | null
          lists: Json | null
          panes: Json | null
          selected: string | null
          updated_at: string
          user_id: string
          viewed_by_list: Json | null
          watchlist: Json | null
        }
        Insert: {
          alert_sound?: boolean | null
          alerts?: Json | null
          chart_cfg?: Json | null
          indicators?: Json | null
          last_list_id?: string | null
          lists?: Json | null
          panes?: Json | null
          selected?: string | null
          updated_at?: string
          user_id: string
          viewed_by_list?: Json | null
          watchlist?: Json | null
        }
        Update: {
          alert_sound?: boolean | null
          alerts?: Json | null
          chart_cfg?: Json | null
          indicators?: Json | null
          last_list_id?: string | null
          lists?: Json | null
          panes?: Json | null
          selected?: string | null
          updated_at?: string
          user_id?: string
          viewed_by_list?: Json | null
          watchlist?: Json | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          approved: boolean
          created_at: string
          email: string | null
          is_admin: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          email?: string | null
          is_admin?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          email?: string | null
          is_admin?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_screens: {
        Row: {
          created_at: string
          filters: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_alert_triggers: {
        Args: { _at: string; _disable: boolean; _ids: string[] }
        Returns: undefined
      }
      compute_market_breadth: {
        Args: { _date: string; _min_turnover?: number; _nifty_close?: number }
        Returns: {
          circuit_excluded: number
          computed_at: string
          down25pct_month_count: number
          down25pct_quarter_count: number
          down4pct_count: number
          history_days: number
          liquidity_excluded: number
          momentum_burst_5day_count: number
          new_52w_highs: number
          new_52w_lows: number
          nifty_close: number | null
          pct_above_50dma: number | null
          trade_date: string
          universe_count: number
          up25pct_month_count: number
          up25pct_quarter_count: number
          up4pct_count: number
          up4pct_ratio_10day: number | null
          up4pct_ratio_5day: number | null
          up50pct_month_count: number
          up50pct_quarter_count: number
        }
        SetofOptions: {
          from: "*"
          to: "market_breadth_daily"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_todays_movers: {
        Args: { _date?: string; _limit?: number }
        Returns: {
          change_pct: number
          close: number
          gain_5day: number
          rel_volume: number
          symbol: string
          trade_date: string
          turnover: number
          volume: number
        }[]
      }
      install_breadth_cron_jobs: { Args: { _secret: string }; Returns: string }
      install_index_cron_jobs: { Args: { _secret: string }; Returns: string }
      install_snapshot_cron_jobs: { Args: { _secret: string }; Returns: string }
      is_admin: { Args: { _uid: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
