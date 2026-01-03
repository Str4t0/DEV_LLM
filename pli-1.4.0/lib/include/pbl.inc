/*********************************************************************/
/* pbl.h: header file for portions of PBL - The Program Base Library */
/* Original Copyright (C) 2002 - 2015   Peter Graf                   */
/* Modified for Iron Spring PL/I 15 Aug, 2017                        */
/*                                                                   */
/* This header contains only the definitions required for pblIsam,   */
/* an open source implementation of C-Isam.                          */
/*                                                                   */
/* This header licensed under the Gno Lesser General Public License  */
/* (LGPL) 2.1 or later.                                              */
/*                                                                   */
/*********************************************************************/

/*********************************************************************/
/* Values of pblErrno                                                */
/*********************************************************************/

%replace PBL_ERROR_BASE             by     1000;

%replace PBL_ERROR_OUT_OF_MEMORY    by     1001;                  
%replace PBL_ERROR_EXISTS           by     1002;                  
%replace PBL_ERROR_NOT_FOUND        by     1003;                  
%replace PBL_ERROR_BAD_FILE         by     1004;
%replace PBL_ERROR_PARAM_MODE       by     1005;
%replace PBL_ERROR_PARAM_KEY        by     1006;
%replace PBL_ERROR_PARAM_KEYLEN     by     1007;
%replace PBL_ERROR_PARAM_DATA       by     1008;
%replace PBL_ERROR_PARAM_DATALEN    by     1009;
%replace PBL_ERROR_PARAM_INDEX      by     1010;
%replace PBL_ERROR_PARAM_LIST       by     1011;
%replace PBL_ERROR_PARAM_COLLECTION by     1012;
%replace PBL_ERROR_PARAM_ELEMENT    by     1013;
%replace PBL_ERROR_PARAM_SET        by     1014;
%replace PBL_ERROR_PARAM_FORMAT     by     1015;

%replace PBL_ERROR_CREATE           by     1020;
%replace PBL_ERROR_OPEN             by     1021;
%replace PBL_ERROR_SEEK             by     1022;
%replace PBL_ERROR_READ             by     1023;
%replace PBL_ERROR_WRITE            by     1024;

%replace PBL_ERROR_PROGRAM          by     1030;

%replace PBL_ERROR_NOFIT            by     1031;

%replace PBL_ERROR_NOT_ALLOWED      by     1040;
%replace PBL_ERROR_POSITION         by     1041;
%replace PBL_ERROR_OUT_OF_BOUNDS    by     1042;
%replace PBL_ERROR_CONCURRENT_MODIFICATION by 1043;                   

/* Definitions for Key File Parameters */
%replace PBLEQ         by    1;    /* any record that is equal       */
%replace PBLFI         by    2;    /* first record that is equal     */
%replace PBLLA         by    3;    /* last record that is equal      */
%replace PBLGE         by    4;    /* last equal or first that is gre*/  
%replace PBLGT         by    5;    /* first that is greater          */
%replace PBLLE         by    6;    /* first equal or last that is sma*/  
%replace PBLLT         by    7;    /* last that is smaller           */

/* Definitions for ISAM Parameters */
%replace PBLTHIS       by    1;  /* get key and keylen of current rec*/
%replace PBLNEXT       by    2;  /* get key and keylen of next record*/
%replace PBLPREV       by    3;  /* get key and keylen of previous re*/
%replace PBLFIRST      by    4;  /* get key and keylen of first rec  */
%replace PBLLAST       by    5;  /* get key and keylen of last record*/

%replace PBLKEYLENGTH  by  255;  /*  maximum length of a key         */
%replace PBLDATALENGTH by  1024; /*  maximum length of a key         */

dcl 1 pblIsamFile             based,
      2 magic                 ptr;      /* char * magic               */

dcl   pbl_errno               fixed bin(31)  ext( 'pbl_errno' );

/*********************************************************************/
/* FUNCTIONS ON ISAM FILES                                           */
/*********************************************************************/
dcl       pblIsamCommit       entry( fixed bin(31),    /* nfiles     */
                                     ptr,              /* **isamfiles*/
                                     fixed bin(31) )   /* rollback   */
                              returns( fixed bin(31) ) /* pblerrno   */ 
                              options( asm linkage(system) )
                              ext( 'pblIsamCommit' );

dcl       pblIsamClose        entry( ptr )        /* *isamfile       */
                              returns( fixed bin(31))
                              options( asm linkage(system) )
                              ext( 'pblIsamClose' );

dcl       pblIsamDelete       entry( ptr )        /* *isamfile       */
                              returns( fixed bin(31))
                              options( asm linkage(system) )
                              ext( 'pblIsamDelete' );

dcl       pblIsamFind         entry( ptr,              /* *isamfile  */
                                     fixed bin(31),    /* mode       */
                                     fixed bin(31),    /* index      */
                                     ptr,              /* *skey      */
                                     fixed bin(31),    /* skeylen    */
                                     ptr )             /* *okey      */
                              returns( fixed bin(31) ) /* pblerrno   */ 
                              options( asm linkage(system) )
                              ext( 'pblIsamFind' );

dcl       pblIsamFlush        entry( ptr )        /* *isamfile       */
                              returns( fixed bin(31))
                              options( asm linkage(system) )
                              ext( 'pblIsamFlush' );

dcl       pblIsamGet          entry( ptr,              /* *isamfile  */
                                     fixed bin(31),    /* which      */
                                     fixed bin(31),    /* index      */
                                     ptr )             /* *okey      */
                              returns( fixed bin(31) ) /* pblerrno   */ 
                              options( asm linkage(system) )
                              ext( 'pblIsamGet' );

dcl       pblIsamInsert       entry( ptr,              /* *isamfile  */
                                     ptr,              /* *allkeys   */
                                     fixed bin(31),    /* allkeyslen */
                                     ptr,              /* *data      */
                                     fixed bin(31) )   /* allkeyslen */
                              returns( fixed bin(31) ) /* pblerrno   */ 
                              options( asm linkage(system) )
                              ext( 'pblIsamInsert' );

dcl       pblIsamInsertArgcArgv entry( ptr,            /* *isamfile  */
                                     fixed bin(31),    /* argc       */
                                     ptr,              /* *argv[]    */
                                     ptr,              /* *data      */
                                     fixed bin(31) )   /* datalen    */
                              returns( fixed bin(31) ) /* pblerrno   */ 
                              options( asm linkage(system) )
                              ext( 'pblIsamInsertArgcArgv' );

dcl       pblIsamOpen         entry( ptr,              /* *path      */
                                     fixed bin(31),    /* update     */
                                     ptr,              /* *filesettag*/
                                     fixed bin(31),    /* nkeys      */
                                     ptr,              /* **keyfilena*/
                                     ptr )             /* *keydup    */
                              returns( ptr )           /* *isamfile  */ 
                              options( asm linkage(system) )
                              ext( 'pblIsamOpen' );

dcl       pblIsamReadData     entry( ptr,              /* *isamfile  */
                                     ptr,              /* *buffer    */
                                     fixed bin(31) )   /* bufferlen  */
                              returns( fixed bin(31) ) /* data length*/ 
                              options( asm linkage(system) )
                              ext( 'pblIsamReadData' );

dcl       pblIsamReadKey      entry( ptr,              /* *isamfile  */
                                     fixed bin(31),    /* index      */
                                     ptr )             /* *okey      */
                              returns( fixed bin(31) ) /* data length*/ 
                              options( asm linkage(system) )
                              ext( 'pblIsamReadKey' );

dcl       pblIsamStartTransaction
                              entry( fixed bin(31),    /* nfiles     */
                                     ptr )             /* **isamfiles*/
                              returns( fixed bin(31) ) /* pblerrno   */ 
                              options( asm linkage(system) )
                              ext( 'pblIsamStartTransaction' );

dcl       pblIsamUpdateData   entry( ptr,              /* *isamfile  */
                                     ptr,              /* *data      */
                                     fixed bin(31) )   /* bdatalen   */
                              returns( fixed bin(31) ) /* pblerrno   */ 
                              options( asm linkage(system) )
                              ext( 'pblIsamUpdateData' );

dcl       pblIsamUpdateKey    entry( ptr,              /* *isamfile  */
                                     fixed bin(31),    /* index      */
                                     ptr,              /* *ukey      */
                                     fixed bin(31) )   /* ukeylenn   */
                              returns( fixed bin(31) ) /* pblerrno   */ 
                              options( asm linkage(system) )
                              ext( 'pblIsamUpdateKey' );
