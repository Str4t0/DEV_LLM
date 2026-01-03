 /********************************************************************/
 /*                                                                  */
 /*      Module:        On Control Block (ONCB) Format               */
 /*      Version:       1.1                                          */
 /*      Date:          Sep, 2003                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes an ON-Condition handler            */
 /*                                                                  */
 /*      Length:        32 bytes ('20'x).                            */
 /*                                                                  */
 /*      Where held:    Controlled (Heap) storage.                   */
 /*                                                                  */
 /*      Pointed to by: DSA 'DSA_chc' points to head of chain        */
 /*                     ONCB 'onc_next' points to next ONCB          */
 /*                                                                  */
 /*      Created by:    ON statement execution                       */
 /*                                                                  */
 /*      Deleted by:    Block exit removes ONCB.                     */
 /*                                                                  */
 /*      Dependencies:  Mapped in compiled code.                     */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*          2015-02-13: Add establishing DDS pointer           0.9.8*/
 /*          1.1 - 30 Sep, 2003 - move from DSA to heap.             */
 /*                                                                  */
 /********************************************************************/

 dcl   1 pli_oncb            based,              /*                  */
         5 onc_next          ptr,                /* -> Nxt ONCB'00'x */
         5 onc_pname         ptr,                /* -> Cond name04'x */
         5 onc_version       fixed bin(7),       /* Version num'08'x */
         /* Current version is 1                                     */
         5 onc_flags         bit(8),             /* Flags      '09'x */
         /* .... ...1 ('01'bx) - SNAP specified                      */
         /* .... ..1. ('02'bx) - SYSTEM specified                    */
         /* .... .1.. ('04'bx) - Null ON-Unit                        */
         5 onc_cond          fixed bin(15),      /* OnCode     '0A'x */
         /* Input/Output oncodes are:                              , */
         /*        NAME     10,        RECORD        20,             */
         /*        TRANSMIT 40,        KEY           50,             */
         /*        ENDFILE  70,        UNDEFINEDFILE 80,             */
         /*        ENDPAGE  90,        PENDING      100.             */
         /* CONDITION(name) 500                                      */
         5 onc_unit          entry(ptr)          /* -> On-Unit '0C'x */
                             variable
                             options( LINKAGE(SYSTEM) ),
              /*----  [standard entry variable]  ---------*/
              /* A(entry_point)                     '0C'x */
              /* A(Static_DSA)                      '10'x */
              /*------------------------------------------*/
	 5 onc_dsa           ptr,                /* ->estab. DS'14'x */     
         5 fil               char(8),            /* Reserved   '18'x */
         5 onc_end           char(0);  /* End address of ONCB  '20'x */

 /*------------------------------------------------------------------*/
 /*      Condition or File Name (in static storage) [optional]       */
 /*------------------------------------------------------------------*/
 dcl     onc_cname           char(64)  varying   based(onc_pname);

