# Installation makefile for Iron Spring PL/I compiler 1.4.0
# Linux version.
# Copyright Iron Spring Software 2012.

# This makefile copies the compiler to /usr/bin
# and the library to /usr/local lib, and establishes
# 'plic' and 'libprf.a' as symlinks.

#---------------------------------------------------------
# You must have permission to copy to those directories
# before running.
#---------------------------------------------------------

# Type 'sudo make install' to install the compiler and library.

bad:
	echo "Type sudo make install to install Iron Spring PL/I 1.4.0"

install:
	cp ./plic 			/usr/bin/plic-1.4.0
	ln -fs /usr/bin/plic-1.4.0	/usr/bin/plic
	cp lib/libprf.a 		/usr/lib/libprf-1.4.0
	ln -fs  /usr/lib/libprf-1.4.0 	/usr/lib/libprf.a
