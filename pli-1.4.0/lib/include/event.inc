 /********************************************************************/
 /*           Iron Spring PL/I Runtime Library Version 0.9.2         */
 /*              See license for terms of use                        */
 /*                                                                  */
 /*      Module:        PL/I EVENT variable                          */
 /*      Version:       1.0                                          */
 /*      Date:          Oct, 2010                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes internal format of PL/I EVENT      */
 /*                     variable.                                    */
 /*                                                                  */
 /*      Dependencies:  None                                         */
 /*                                                                  */
 /*      Modifications:                                              */
 /*                                                                  */
 /********************************************************************/

 dcl   1  event_var           aligned based,
          5 ev_flags          bit(32),       /* Event flags 	   00*/
	    /* x... .... .... ....Completion    */
	    /* 1... .... .... ....- complete    */
	    /* 0... .... .... ....- incomplete  */
          5 ev_status         fixed bin(31), /* Event status	   04*/
	  5 ev_hSem           fixed bin(31), /* OS/2: W=Event sem  08*/
	  5 fil               char(4),       /* (reserved)         0C*/
	  5 ev_end            char(0);       /* end of control blk 10*/
