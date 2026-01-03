 /********************************************************************/
 /*                                                                  */
 /*      Module:        PL/I Interruption Control Block (IRCB)       */
 /*      Version:       2.0                                          */
 /*      Date:          Jul, 2004                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Provides information on the occurrence of    */
 /*                     a PL/I condition.  An IRCB is passed as the  */
 /*                     "hidden" parameter to an ON-Unit, and used   */
 /*                     as the source for Condition-handling BIFs    */
 /*                     and Psuedovariables.                         */
 /*                                                                  */
 /*      Length:        64 bytes ('40'x)                             */
 /*                                                                  */
 /*      Where held:    DSA storage for _pli_Sig                     */
 /*                                                                  */
 /*      Created by:    _pli_Sig                                     */
 /*                                                                  */
 /*      Deleted by:    Normal or Non-Normal return from             */
 /*                     condition processing.                        */
 /*                                                                  */
 /*      Dependencies:  None.                                        */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*        2009-05/11 - Change IRCBOnLoc from FIXED BIN to PTR.      */
 /*        2006-11-01 - Add EBP.                                     */
 /*        2004-07-09 - Version 2.0                                  */
 /*                                                                  */
 /********************************************************************/

 dcl   1 IRCB                based,
         5 IRCBVer           fixed bin(7),  /* Version ID 0   +'00'x */
         5 IRCBLen           fixed bin(7),  /* Length of IRCB +'01'x */
         5 IRCBOnCode        fixed bin(15), /* ONCODE value   +'02'x */
         /* See 'ONCODE' for definitions of possible values          */
         5 IRCBError         fixed bin(31), /* Specific info  +'04'x */
         5 IRCBOnLoc         ptr,           /* ->Entry point  +'08'x */
         5 IRCBOnFile        ptr,           /* ONFILE()       +'0C'x */
         /* OnFile also used as pointer to programmer-defined cond.  */
         5 IRCBOnChar        ptr,           /* ONCHAR()       +'10'x */
         /* DATAFIELD, ONKEY and ONSOURCE point to loc/desc pairs    */
         5 IRCBDatafield     ptr,           /* DATAFIELD()    +'14'x */
         5 IRCBOnKey         ptr,           /* ONKEY()        +'18'x */
         5 IRCBOnSource      ptr,           /* ONSOURCE()     +'1C'x */
         /* ONCOUNT() is always zero - no multiple interrupts        */
         5 IRCBExcRepRec     ptr,           /* ->OS trap info +'20'x */
         /* -> Exception Report Record (OS/2)                        */
         /* -> Siginfo (Linux)                                       */
         5 IRCBContext       ptr,           /* ->Context      +'24'x */
         5 IRCBCondition     ptr,           /* ->Cond Name    +'28'x */
         5 IRCBEBP           ptr,           /* Inter. EBP     +'2C'x */
         5 fil               char(12),      /* (reserved)     +'34'x */
         5 IRCBStatus        fixed bin(31), /* Return status  +'3C'x */
         /* If IRCBStatusª=0, an assignment was made to the ONSOURCE */
         /* and/or ONCHAR pseudovariables.                           */
         5 EndIRCB           char(0);       /* End of struct. +'40'x */
