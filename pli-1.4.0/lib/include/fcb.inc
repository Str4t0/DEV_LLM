 /********************************************************************/
 /*                                                                  */
 /*      Module:        File Control Block (FCB)                     */
 /*      Version:       1.3                                          */
 /*      Date:          Feb, 2004                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Holds information about an open file.        */
 /*                                                                  */
 /*                     The FCB merges file attribute information    */
 /*                     from the DCLCB with attributes specified     */
 /*                     or implied by the OPEN or other I/O          */
 /*                     statement that first references the file.    */
 /*                     It also contains state information used by   */
 /*                     the I/O routines.                            */
 /*                                                                  */
 /*      Length:        160 bytes ('A0'x).                           */
 /*                                                                  */
 /*      Where held:    Controlled (Heap) storage.                   */
 /*                                                                  */
 /*      Pointed to by: FILE variable or FILE constant +00.          */
 /*                                                                  */
 /*      Created by:    _pli_IOR                                     */
 /*                     at explicit or implicit OPEN for file.       */
 /*                                                                  */
 /*      Deleted by:    _pli_IOR at file CLOSE.                      */
 /*                                                                  */
 /*      Dependencies:  None.                                        */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*         2017-08-18:   ISAM modifications                   0.9.10*/
 /*         2014-03-31:   Add FCB_recl for curr rec length      0.9.5*/
 /*         2011-08-15:   Add values for 'FCB_status'           0.9.3*/
 /*         2009-08-21:   Add 'TEXT' environment attribute.      0.8c*/
 /*         Version 1.3:  Rearrange, expand.                         */
 /*         Version 1.2a: Add FCB_pFile back.                        */
 /*         Version 1.2:  Add TID, COUNT; rearrange.                 */
 /*                                                                  */
 /********************************************************************/

 dcl   1 FCB                 aligned based,
        2 FCB_chains,
         5 FCBNext           ptr,      /* -> Next FCB on chain '00'x */
         5 FCBPrev           ptr,      /* -> Prev FCB on chain '04'x */

        /* Information in 'FCB_transient' is valid only for the      */
        /* duration of the current I/O operation.                    */
        2 FCB_transient,                         /*            '08'x */
         5 FCB_pFile         ptr,                /* -> FILE    '08'x */
         5 FCB_TID           fixed bin(31),      /* Active TID '0C'x */
         /* TID contains -1 if file is not in use, otherwise thread  */
         /* id of currently active (owning) thread.                  */
         5 FCB_pError        ptr,                /* -> Err stat'10'x */
         /* FCB_pError is a pointer to specific error information    */
         /* stored when an I/O condition is raised and cleared       */
         /* when the condition is recognized.                        */
         5 fil1              char(8),            /* (reserved) '14'x */

        2 FCB_local,                   /* Local context info.  '1C'x */
         5 FCB_pTitle        ptr,                /* -> Title   '1C'x */
         5 FCB_pFileName     ptr,                /* -> File Name20'x */
         5 FCB_status        bit(32),            /* Status flags24'x */
         /* '80000000'bx - File is open                 ( 1)         */
         /* '40000000'bx - ENDFILE raised               ( 2)         */
         /* '00000004'bx - (ISAM) last read was SET     (30)         */
         /* '00000002'bx - Buffer Flush                 (31)         */
         /* '00000001'bx - Buffer is 'dirty'            (32)         */
         5 FCB_sysdep        union,
           10 FCB_HFILE      fixed bin(31),      /* 'file handle28'x */
           10 FCB_pIsamFile  ptr,                /* ->ISAM file'28'x */
         5 FCB_aBuf          ptr,                /* addr(buffer'2C'x */
         5 FCB_pBuf          ptr,                /* -> buffer  '30'x */
         5 FCB_bufsize       fixed bin(31),      /* Buffer len '34'x */
         /* FCB_bufsize is the amount of data currently in the buffer*/
         5 FCB_LastSt        fixed bin(31),      /* Last status'38'x */
         5 FCB_CurrPos       fixed bin(31),      /* File Pos   '3C'x */
         5 FCB_CurrPos2      char(4),            /* (reserved) '40'x */
         5 fil2              char(4),            /* (reserved)  44'x */

         /* FCB Stream Buffer Block (SBB)                      '48'x */
         /* This FCB_SBB structure or its equivalent for GET/PUT     */
         /* STRING is passed as a unit to the GET/PUT processor.     */
         /* FCB_aLine is also used for RECORD files as a pointer     */
         /* to the record buffer.                                    */
         5 FCB_SBB,                              /*            '48'x */
           10 FCB_aLine      ptr,                /* addr(line) '48'x */
           10 FCB_pLine      ptr,                /* -> Line    '4C'x */
           10 FCB_lnsize     fixed bin(31),      /* Line length'50'x */
           /* For STREAM OUTPUT, 'FCB_lnsize' is set to the          */
           /* ENVIRONMENT option 'LINESIZE() and never changed.      */
           /* For STREAM INPUT, it is set to the length of each      */
           /* line being processed.                                  */
           10 FCB_col        fixed bin(31),      /* Col pos-1  '54'x */
         5 FCB_LineNo        fixed bin(31),      /* Line number'58'x */
         5 FCB_Count         fixed bin(31),      /* Count BIF  '5C'x */
         5 fil3              char(8),            /* (reserved) '60'x */

        2 FCB_DCLCB,
         /* This portion of the FCB should match the DCLCB     '68'x */
         /* and contains DCLCB information merged with data          */
         /* from OPEN statement or first I/O statement.              */
         5 FCB_attrib        bit(32),  /* Declared attributes +'00'x */
         /* Bit values defined by KEYWORD                            */
         /* '00000001'bx - Backwards             (32)                */
         /* '00000002'bx - Buffered              (31)                */
         /* '00000010'bx - Direct                (28)                */
         /* '00000020'bx - Environment()         (27)                */
         /* '00000040'bx - Exclusive             (26)                */
         /* '00000100'bx - Indexed               (24)                */
         /* '00000200'bx - Input                 (23)                */
         /* '00000400'bx - Keyed                 (22)                */
         /* '00002000'bx - Optional              (20)                */
         /* '00008000'bx - Output                (17)                */
         /* '00010000'bx - Print                 (16)                */
         /* '00020000'bx - Record                (15)                */
         /* '00100000'bx - Sequential            (12)                */
         /* '00200000'bx - Stream                (11)                */
         /* '00400000'bx - Title()               (10)                */
         /* '00800000'bx - Transient             ( 9)                */
         /* '01000000'bx - Unbuffered            ( 8)                */
         /* '02000000'bx - Update                ( 7)                */
         5 fil4              char(8),  /* (reserved)          +'04'x */
         5 FCB_env,                    /* Environment options +'0C'x */
           10 FCB_recsize    fixed bin(31),      /* RECSIZE() +'0C'x */
           /* FCB_recsize is the size of the record excl. ctl info.  */
           10 FCB_blksize    fixed bin(31),      /* BLKSIZE() +'10'x */
           /* FCB_blksize is the size of the buffer                  */
           10 FCB_bufsp      fixed bin(31),      /* BUFSP()   +'14'x */
           /* FCB_bufsp is currently unused                          */
           10 FCB_keylen     fixed bin(31),      /* KEYLENGTH(+'18'x */
           10 FCB_keyloc     fixed bin(31),      /* KEYLOC()  +'1C'x */
           10 FCB_envflags   bit(32),            /* Misc Attr +'20'x */
           /* '80000000'bx - VARLS               ( 1)                */
           /* '40000000'bx - Append              ( 2)                */
           /* '20000000'bx - LF                  ( 3)                */
           /* '10000000'bx - CRLF                ( 4)                */
           /* '08000000'bx - TEXT (=LF or CRLF)  ( 5)            0.8c*/
           /* '04000000'bx - INTERACTIVE         ( 6)           0.9.3*/
           /* '02000000'bx - INDEXED             ( 7)          0.9.10*/
           /* '00400000'bx - Blksize specified   (10)                */
           /* '00200000'bx - Recsize specified   (11)                */
           /* '00100000'bx - Scalarvarying       (12)                */
           /* '00040000'bx - Total               (14)                */
           /* '00020000'bx - Regional            (15)                */
           /* '00010000'bx - Consecutive         (16)                */
           /* '00002000'bx - CTL360              (19)                */
           /* '00001000'bx - CTLASA              (20)                */
           /* '00000400'bx - VS                  (22)                */
           /* '00000200'bx - VBS                 (23)                */
           /* '00000100'bx - VB                  (24)                */
           /* '00000080'bx - V                   (25)                */
           /* '00000040'bx - U                   (26)                */
           /* '00000020'bx - FS                  (27)                */
           /* '00000010'bx - FBS                 (28)                */
           /* '00000008'bx - FB                  (29)                */
           /* '00000004'bx - F                   (30)                */
           /* '00000002'bx - DB                  (31)                */
           /* '00000001'bx - D                   (32)                */
         5 fil5              char(12),           /* (reserved)+'24'x */
         /* End of DCLCB common portion of FCB                 '98'x */

        2 FCB_open,                    /* OPEN options         '98'x */
           10 FCB_linesize   fixed bin(31),      /* LINESIZE() '98'x */
           10 FCB_pagesize   fixed bin(31),      /* PAGESIZE() '9C'x */

         5 FCB_end           char(0);            /* End of FCB 'A0'x */
	 
 /* Values for 'FCB_status'                                     0.9.3*/
 dcl     FCB_file_open       bit(32)    static    init( '80000000'bx ); 
 dcl     FCB_endfile         bit(32)    static    init( '40000000'bx ); 
 dcl     FCB_buf_flsh        bit(32)    static    init( '00000002'bx ); 
 dcl     FCB_buf_dirty       bit(32)    static    init( '00000001'bx ); 
 
 dcl     FCB_FileName        char(64)   varying  based;
 dcl     FCB_Title           char(2048) varying  based; /* Null-term */

