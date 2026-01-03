 /********************************************************************/
 /*                                                                  */
 /*      Module:        File Declaration Control Block (DCLCB)       */
 /*      Version:       1.0                                          */
 /*      Date:          Aug, 2002                                    */
 /*      Author:        Peter Flass                                  */
 /*                                                                  */
 /*      Function:      Describes the declared attributes of a file  */
 /*                     for I/O routines.                            */
 /*                                                                  */
 /*                     This is the same data as held in the         */
 /*                     symbol table entry for the file during       */
 /*                     compilation.                                 */
 /*                                                                  */
 /*      Length:        48 bytes ('30'x).                            */
 /*                                                                  */
 /*      Where held:    Static storage for the procedure containing  */
 /*                     the file declaration.                        */
 /*                                                                  */
 /*      Created by:    Generated at compilation.                    */
 /*                                                                  */
 /*      Deleted by:    None.                                        */
 /*                                                                  */
 /*      Dependencies:  None.                                        */
 /*                                                                  */
 /*      To Do:                                                      */
 /*                                                                  */
 /*      Modifications:                                              */
 /*         2017-08-18: ISAM modifications                     0.9.10*/
 /*         2014-04-27: Remove unused 'DCLCB_title'.            0.9.5*/
 /*         2009-08-21: Add 'TEXT' environment attribute.        0.8c*/
 /*         2004-04-23: 'Append' environment option.                 */
 /*                                                                  */
 /********************************************************************/

 dcl   1 DCLCB               aligned based,
         5 DCLCB_attrib      bit(32),  /* Declared attributes  '00'x */
         /* Bit values defined by KEYWORD                            */
         /* '00000001'bx - Backwards                                 */
         /* '00000002'bx - Buffered                                  */
         /* '00000010'bx - Direct                                    */
         /* '00000020'bx - Environment()                             */
         /* '00000040'bx - Exclusive                                 */
         /* '00000080'bx - File                                      */
         /* '00000100'bx - Indexed                                   */
         /* '00000200'bx - Input                                     */
         /* '00000400'bx - Keyed                                     */
         /* '00002000'bx - Optional                                  */
         /* '00008000'bx - Output                                    */
         /* '00010000'bx - Print                                     */
         /* '00020000'bx - Record                                    */
         /* '00100000'bx - Sequential                                */
         /* '00200000'bx - Stream                                    */
         /* '00400000'bx - Title()                                   */
         /* '00800000'bx - Transient                                 */
         /* '01000000'bx - Unbuffered                                */
         /* '02000000'bx - Update                                    */
         5 fil1              char(8),  /* (reserved)           '04'x */
         5 DCLCB_env,                  /* Environment options  '0C'x */
           10 DCLCB_recsize  fixed bin(31),      /* RECSIZE()  '0C'x */
           10 DCLCB_blksize  fixed bin(31),      /* BLKSIZE()  '10'x */
           10 DCLCB_bufsp    fixed bin(31),      /* BUFSP()    '14'x */
           10 DCLCB_keylen   fixed bin(31),      /* KEYLENGTH()'18'x */
           10 DCLCB_keyloc   fixed bin(31),      /* KEYLOC()   '1C'x */
           10 DCLCB_envflags bit(32),            /* Misc Attr  '20'x */
           /* '40000000'bx - Append              ( 2)        20040423*/
           /* '20000000'bx - LF                  ( 3)        20030912*/
           /* '10000000'bx - CRLF                ( 4)        20030912*/
           /* '08000000'bx - TEXT (=LF or CRLF)  ( 5)            0.8c*/
           /* '04000000'bx - INTERACTIVE         ( 6)           0.9.3*/
           /* '02000000'bx - ISAM                ( 7)          0.9.10*/
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
         5 fil2              char(12),           /* (reserved) '24'x */
         5 DCLCB_end         char(0);            /* End of ent.'30'x */
