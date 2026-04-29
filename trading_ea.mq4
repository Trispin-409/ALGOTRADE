//+------------------------------------------------------------------+
//|                                              AI_Signal_Bridge.mq4|
//|                                  Copyright 2024, Trading Systems |
//|                                             https://trading.com |
//+------------------------------------------------------------------+
#property copyright "Copyright 2024"
#property link      "https://trading.com"
#property version   "1.00"
#property strict

//--- input parameters
input int      MagicNumber = 123456;
input double   LotSize     = 0.01;
input int      StopLoss    = 200;    // Points
input int      TakeProfit  = 400;    // Points
input int      Slippage    = 3;
input bool     UseGlobalVarSignal = true; // Use GlobalVariables as bridge

//--- Constants
string SIGNAL_VAR_NAME = "AI_SIGNAL_" + Symbol();

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("AI Signal Bridge Initialized for ", Symbol());
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // 1. Check permissions
   if(!IsTradeAllowed()) return;
   if(IsTradeContextBusy()) return;
   
   // 2. Check for signal from GlobalVariables (Bridge from Node.js)
   // Node.js would set GlobalVariableSet("AI_SIGNAL_XAUUSDm", 1 for BUY, 2 for SELL)
   int signal = 0;
   if(UseGlobalVarSignal)
   {
      if(GlobalVariableCheck(SIGNAL_VAR_NAME))
      {
         signal = (int)GlobalVariableGet(SIGNAL_VAR_NAME);
         GlobalVariableDel(SIGNAL_VAR_NAME); // Consume signal
      }
   }
   
   // 3. Execution Logic
   if(signal == 1) // BUY
   {
      ExecuteTrade(OP_BUY);
   }
   else if(signal == 2) // SELL
   {
      ExecuteTrade(OP_SELL);
   }
}

//+------------------------------------------------------------------+
//| Core Execution Function                                          |
//+------------------------------------------------------------------+
void ExecuteTrade(int type)
{
   // Check for duplicate trades (Only one per symbol/magic)
   if(CountOpenPositions() > 0) 
   {
      Print("[EA] Trade skipped - Position already open");
      return;
   }

   double price = (type == OP_BUY) ? Ask : Bid;
   double sl = 0;
   double tp = 0;
   
   if(StopLoss > 0)
      sl = (type == OP_BUY) ? price - StopLoss * Point : price + StopLoss * Point;
   if(TakeProfit > 0)
      tp = (type == OP_BUY) ? price + TakeProfit * Point : price - TakeProfit * Point;

   int ticket = OrderSend(Symbol(), type, LotSize, price, Slippage, sl, tp, "AI Signal Bridge", MagicNumber, 0, (type == OP_BUY) ? clrBlue : clrRed);
   
   if(ticket < 0)
   {
      int error = GetLastError();
      Print("[ERROR] OrderSend failed with error: ", error);
      
      // Basic Error handling
      if(error == 130) Print("Invalid S/L or T/P (Too close to market)");
      if(error == 134) Print("Not enough money");
      if(error == 146) Print("Trade context busy");
   }
   else
   {
      Print("[SUCCESS] Trade opened. Ticket ID: ", ticket);
   }
}

//+------------------------------------------------------------------+
//| Helper: Count open positions                                     |
//+------------------------------------------------------------------+
int CountOpenPositions()
{
   int count = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         if(OrderSymbol() == Symbol() && OrderMagicNumber() == MagicNumber)
         {
            count++;
         }
      }
   }
   return count;
}
