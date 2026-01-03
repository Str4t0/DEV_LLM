 %replace sys_getdents64 by 220;
 /* LFS version of dirent64                                            */
 /* PL/I version 1.1.1 -- July, 2023                                   */
 dcl    1 dirent64            based,
          5 d_ino             char(8),       /* FIXED BIN(64) unsigned */
          5 d_off             char(8),       /* FIXED BIN(64) unsigned */
          5 d_reclen          fixed bin(16)  unsigned,
          5 d_type            bit(8),
          5 d_name            char(256);
