-- phpMyAdmin SQL Dump
-- version 5.1.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 20, 2021 at 08:13 PM
-- Server version: 10.4.21-MariaDB
-- PHP Version: 7.3.31

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `databinger`
--

-- --------------------------------------------------------

--
-- Table structure for table `artistparticipations`
--

CREATE TABLE `artistparticipations` (
  `arpID` int(11) NOT NULL,
  `arpBandID` int(11) DEFAULT NULL,
  `arpArtistID` int(11) DEFAULT NULL,
  `arpStartDates` text DEFAULT NULL,
  `arpEndDates` text DEFAULT NULL,
  `arpParticipationTypeID` text DEFAULT NULL,
  `artInstrumentID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `artists`
--

CREATE TABLE `artists` (
  `artID` int(11) NOT NULL,
  `artName` text DEFAULT NULL,
  `artMiddleName` text DEFAULT NULL,
  `artLastName` text DEFAULT NULL,
  `artStageName` text DEFAULT NULL,
  `artBirthDate` date DEFAULT NULL,
  `artBirthPlace` text DEFAULT NULL,
  `artBirthCountryID` int(11) DEFAULT NULL,
  `artDeathDate` date DEFAULT NULL,
  `artDeathPlace` text DEFAULT NULL,
  `artInstrumentID` text DEFAULT NULL,
  `artDeathCountryID` int(11) DEFAULT NULL,
  `artGenderID` text DEFAULT NULL,
  `artOccupationID` text DEFAULT NULL,
  `artPictureID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `bands`
--

CREATE TABLE `bands` (
  `bndID` int(11) NOT NULL,
  `bndName` text DEFAULT NULL,
  `bandscol` varchar(45) DEFAULT NULL,
  `bndOtherNames` text DEFAULT NULL,
  `bndFormationPlace` text DEFAULT NULL,
  `bndCountryID` int(11) DEFAULT NULL,
  `bndStartingDates` text DEFAULT NULL,
  `bndEndingDates` text DEFAULT NULL,
  `bndMembersID` text DEFAULT NULL,
  `bndSubgenresID` text DEFAULT NULL,
  `bndIsSolo` text DEFAULT NULL,
  `bndWebsites` text DEFAULT NULL,
  `bndPictureID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `books`
--

CREATE TABLE `books` (
  `booID` int(11) NOT NULL,
  `booTitle` text DEFAULT NULL,
  `booAuthorID` text DEFAULT NULL,
  `booReleaseDate` text DEFAULT NULL,
  `booEditorID` text DEFAULT NULL,
  `booCoverID` text DEFAULT NULL,
  `booCountryID` text DEFAULT NULL,
  `booGenreID` text DEFAULT NULL,
  `booSubGenreID` text DEFAULT NULL,
  `booNumber` int(11) DEFAULT NULL,
  `booSeriesID` int(11) DEFAULT NULL,
  `booPublisherID` text DEFAULT NULL,
  `booContinuityID` text DEFAULT NULL,
  `bookISBN` text DEFAULT NULL,
  `bookSourceMaterialID` text DEFAULT NULL,
  `booMediaTypeID` text DEFAULT NULL,
  `booLanguageID` text DEFAULT NULL,
  `booEdition` text DEFAULT NULL,
  `booVolume` text DEFAULT NULL,
  `booCharactersID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `bookseries`
--

CREATE TABLE `bookseries` (
  `bosID` int(11) NOT NULL,
  `bosName` text DEFAULT NULL,
  `botCreatorID` text DEFAULT NULL,
  `bosSourceMaterialID` text DEFAULT NULL,
  `bosMediaTypeID` text DEFAULT NULL,
  `bosCoverID` text DEFAULT NULL,
  `bosWebsites` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `characters`
--

CREATE TABLE `characters` (
  `chrID` int(11) NOT NULL,
  `chrName` text DEFAULT NULL,
  `chrPerformanceID` text DEFAULT NULL,
  `chrSeriesID` text DEFAULT NULL,
  `chrMoviesID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `companies`
--

CREATE TABLE `companies` (
  `comID` int(11) NOT NULL,
  `comName` text DEFAULT NULL,
  `comFounder` text DEFAULT NULL,
  `comCreationDate` text DEFAULT NULL,
  `comDefunctionDate` text DEFAULT NULL,
  `comTypeID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `companytypes`
--

CREATE TABLE `companytypes` (
  `ctyID` int(11) NOT NULL,
  `ctyName` text DEFAULT NULL,
  `ctyMediaType` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `contenttype`
--

CREATE TABLE `contenttype` (
  `cntID` int(11) NOT NULL COMMENT 'Content type ID',
  `cntName` text DEFAULT NULL COMMENT 'Content type name',
  `cntSortID` text DEFAULT NULL COMMENT 'Content type column sort'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `contenttype`
--

INSERT INTO `contenttype` (`cntID`, `cntName`, `cntSortID`) VALUES
(100, 'Countries', NULL),
(200, 'Music', NULL),
(300, 'Movies', NULL),
(400, 'Series', NULL),
(500, 'Books', NULL),
(600, 'Images', NULL),
(700, 'Videos', NULL),
(800, 'Games', NULL),
(900, 'Files', NULL),
(1000, 'Other', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `continents`
--

CREATE TABLE `continents` (
  `conID` int(2) NOT NULL COMMENT 'Continent ID',
  `conName` varchar(40) DEFAULT NULL COMMENT 'Continent name',
  `conISO` varchar(2) DEFAULT NULL COMMENT 'Continent ISO code',
  `conMediaTypeID` int(11) DEFAULT NULL COMMENT 'Media type ID'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `continents`
--

INSERT INTO `continents` (`conID`, `conName`, `conISO`, `conMediaTypeID`) VALUES
(1001, 'Africa', 'af', 100),
(1002, 'Asia', 'as', 100),
(1003, 'Europe', 'eu', 100),
(1004, 'North America', 'na', 100),
(1005, 'South America', 'sa', 100),
(1006, 'Oceania', 'oc', 100),
(1007, 'Antarctica', 'an', 100);

-- --------------------------------------------------------

--
-- Table structure for table `continuities`
--

CREATE TABLE `continuities` (
  `ctnID` int(11) NOT NULL,
  `ctnName` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `countries`
--

CREATE TABLE `countries` (
  `couID` int(11) NOT NULL COMMENT 'Country ID',
  `couContinentID` int(2) DEFAULT NULL COMMENT 'Continent ID',
  `couName` text DEFAULT NULL COMMENT 'Country name',
  `couISO` varchar(2) DEFAULT NULL COMMENT 'ISO country code',
  `couMediaTypeID` int(11) DEFAULT NULL COMMENT 'Media Type ID'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `countries`
--

INSERT INTO `countries` (`couID`, `couContinentID`, `couName`, `couISO`, `couMediaTypeID`) VALUES
(100001, 1001, 'Algeria', 'dz', 100),
(100002, 1001, 'Angola', 'ao', 100),
(100003, 1001, 'Benin', 'bj', 100),
(100004, 1001, 'Botswana', 'bw', 100),
(100005, 1001, 'Burkina Faso', 'bf', 100),
(100006, 1001, 'Burundi', 'bi', 100),
(100007, 1001, 'Cameroon', 'cm', 100),
(100008, 1001, 'Cape Verde', 'cv', 100),
(100009, 1001, 'Central African Republic', 'cf', 100),
(100010, 1001, 'Chad', 'td', 100),
(100011, 1001, 'Comoros', 'km', 100),
(100012, 1001, 'Democratic Republic of the Congo', 'cd', 100),
(100013, 1001, 'Djibouti', 'dj', 100),
(100014, 1001, 'Egypt', 'eg', 100),
(100015, 1001, 'Equatorial Guinea', 'gq', 100),
(100016, 1001, 'Eritrea', 'er', 100),
(100017, 1001, 'Ethiopia', 'et', 100),
(100018, 1001, 'Gabon', 'ga', 100),
(100019, 1001, 'Gambia', 'gm', 100),
(100020, 1001, 'Ghana', 'gh', 100),
(100021, 1001, 'Guinea', 'gn', 100),
(100022, 1001, 'Guinea-Bissau', 'gw', 100),
(100023, 1001, 'Ivory Coast', 'ci', 100),
(100024, 1001, 'Kenya', 'ke', 100),
(100025, 1001, 'Lesotho', 'ls', 100),
(100026, 1001, 'Liberia', 'lr', 100),
(100027, 1001, 'Libya', 'ly', 100),
(100028, 1001, 'Madagascar', 'mg', 100),
(100029, 1001, 'Malawi', 'mw', 100),
(100030, 1001, 'Mali', 'ml', 100),
(100031, 1001, 'Mauritania', 'mr', 100),
(100032, 1001, 'Mauritius', 'mu', 100),
(100033, 1001, 'Morocco', 'ma', 100),
(100034, 1001, 'Mozambique', 'mz', 100),
(100035, 1001, 'Namibia', 'na', 100),
(100036, 1001, 'Niger', 'ne', 100),
(100037, 1001, 'Nigeria', 'ng', 100),
(100038, 1001, 'Republic of the Congo', 'cg', 100),
(100039, 1001, 'Rwanda', 'rw', 100),
(100040, 1001, 'São Tomé and Príncipe', 'st', 100),
(100041, 1001, 'Senegal', 'sn', 100),
(100042, 1001, 'Seychelles', 'sc', 100),
(100043, 1001, 'Sierra Leone', 'sl', 100),
(100044, 1001, 'Somalia', 'so', 100),
(100045, 1001, 'South Africa', 'za', 100),
(100046, 1001, 'South Sudan', 'ss', 100),
(100047, 1001, 'Sudan', 'sd', 100),
(100048, 1001, 'Swaziland', 'sz', 100),
(100049, 1001, 'Tanzania', 'tz', 100),
(100050, 1001, 'Togo', 'tg', 100),
(100051, 1001, 'Tunisia', 'tn', 100),
(100052, 1001, 'Uganda', 'ug', 100),
(100053, 1001, 'Zambia', 'zm', 100),
(100054, 1001, 'Zimbabwe', 'zw', 100),
(100055, 1002, 'Afghanistan', 'af', 100),
(100056, 1002, 'Armenia', 'am', 100),
(100057, 1002, 'Azerbaijan', 'az', 100),
(100058, 1002, 'Bahrain', 'bh', 100),
(100059, 1002, 'Bangladesh', 'bd', 100),
(100060, 1002, 'Bhutan', 'bt', 100),
(100061, 1002, 'Brunei', 'bn', 100),
(100062, 1002, 'Cambodia', 'kh', 100),
(100063, 1002, 'China', 'cn', 100),
(100064, 1002, 'Cyprus', 'cy', 100),
(100065, 1002, 'Taiwan', 'tw', 100),
(100066, 1002, 'East Timor', 'tl', 100),
(100067, 1002, 'Georgia', 'ge', 100),
(100068, 1002, 'India', 'in', 100),
(100069, 1002, 'Indonesia', 'id', 100),
(100070, 1002, 'Iran', 'ir', 100),
(100071, 1002, 'Iraq', 'iq', 100),
(100072, 1002, 'Israel', 'il', 100),
(100073, 1002, 'Japan', 'jp', 100),
(100074, 1002, 'Jordan', 'jo', 100),
(100075, 1002, 'Kazakhstan', 'kz', 100),
(100076, 1002, 'Kuwait', 'kw', 100),
(100077, 1002, 'Kyrgyzstan', 'kg', 100),
(100078, 1002, 'Laos', 'la', 100),
(100079, 1002, 'Lebanon', 'lb', 100),
(100080, 1002, 'Malaysia', 'my', 100),
(100081, 1002, 'Maldives', 'mv', 100),
(100082, 1002, 'Mongolia', 'mn', 100),
(100083, 1002, 'Myanmar', 'mm', 100),
(100084, 1002, 'Nepal', 'np', 100),
(100085, 1002, 'North Korea', 'kp', 100),
(100086, 1002, 'Oman', 'om', 100),
(100087, 1002, 'Pakistan', 'pk', 100),
(100088, 1002, 'Philippines', 'ph', 100),
(100089, 1002, 'Palestine', 'ps', 100),
(100090, 1002, 'Qatar', 'qa', 100),
(100091, 1002, 'Russia', 'ru', 100),
(100092, 1002, 'Saudi Arabia', 'sa', 100),
(100093, 1002, 'Singapore', 'sg', 100),
(100094, 1002, 'South Korea', 'kr', 100),
(100095, 1002, 'Sri Lanka', 'lk', 100),
(100096, 1002, 'Syria', 'sy', 100),
(100097, 1002, 'Tajikistan', 'tj', 100),
(100098, 1002, 'Thailand', 'th', 100),
(100099, 1002, 'Turkey', 'tr', 100),
(100100, 1002, 'Turkmenistan', 'tm', 100),
(100101, 1002, 'United Arab Emirates', 'ae', 100),
(100102, 1002, 'Uzbekistan', 'uz', 100),
(100103, 1002, 'Vietnam', 'vn', 100),
(100104, 1002, 'Yemen', 'ye', 100),
(100105, 1003, 'Albania', 'al', 100),
(100106, 1003, 'Andorra', 'ad', 100),
(100107, 1003, 'Austria', 'at', 100),
(100108, 1003, 'Belarus', 'by', 100),
(100109, 1003, 'Belgium', 'be', 100),
(100110, 1003, 'Bosnia and Herzegovina', 'ba', 100),
(100111, 1003, 'Bulgaria', 'bg', 100),
(100112, 1003, 'Croatia', 'hr', 100),
(100113, 1003, 'Czech Republic', 'cz', 100),
(100114, 1003, 'Denmark', 'dk', 100),
(100115, 1003, 'Estonia', 'ee', 100),
(100116, 1003, 'Finland', 'fi', 100),
(100117, 1003, 'France', 'fr', 100),
(100118, 1003, 'Germany', 'de', 100),
(100119, 1003, 'Greece', 'gr', 100),
(100120, 1003, 'Hungary', 'hu', 100),
(100121, 1003, 'Iceland', 'is', 100),
(100122, 1003, 'Ireland', 'ie', 100),
(100123, 1003, 'Italy', 'it', 100),
(100124, 1003, 'Kosovo', 'xk', 100),
(100125, 1003, 'Latvia', 'lv', 100),
(100126, 1003, 'Liechtenstein', 'li', 100),
(100127, 1003, 'Lithuania', 'lt', 100),
(100128, 1003, 'Luxembourg', 'lu', 100),
(100129, 1003, 'Macedonia', 'mk', 100),
(100130, 1003, 'Malta', 'mt', 100),
(100131, 1003, 'Moldova', 'md', 100),
(100132, 1003, 'Monaco', 'mc', 100),
(100133, 1003, 'Montenegro', 'me', 100),
(100134, 1003, 'Netherlands', 'nl', 100),
(100135, 1003, 'Norway', 'no', 100),
(100136, 1003, 'Poland', 'pl', 100),
(100137, 1003, 'Portugal', 'pt', 100),
(100138, 1003, 'Romania', 'ro', 100),
(100139, 1003, 'Russia', 'ru', 100),
(100140, 1003, 'San Marino', 'sm', 100),
(100141, 1003, 'Serbia', 'rs', 100),
(100142, 1003, 'Slovakia', 'sk', 100),
(100143, 1003, 'Slovenia', 'si', 100),
(100144, 1003, 'Spain', 'es', 100),
(100145, 1003, 'Sweden', 'se', 100),
(100146, 1003, 'Switzerland', 'ch', 100),
(100147, 1003, 'Ukraine', 'ua', 100),
(100148, 1003, 'United Kingdom', 'gb', 100),
(100149, 1003, 'Vatican', 'va', 100),
(100150, 1004, 'Antigua and Barbuda', 'ag', 100),
(100151, 1004, 'Bahamas', 'bs', 100),
(100152, 1004, 'Barbados', 'bb', 100),
(100153, 1004, 'Belize', 'bz', 100),
(100154, 1004, 'Canada', 'ca', 100),
(100155, 1004, 'Costa Rica', 'cr', 100),
(100156, 1004, 'Cuba', 'cu', 100),
(100157, 1004, 'Curacao', 'cw', 100),
(100158, 1004, 'Dominica', 'dm', 100),
(100159, 1004, 'Dominican Republic', 'do', 100),
(100160, 1004, 'El Salvador', 'sv', 100),
(100161, 1004, 'Greenland', 'gl', 100),
(100162, 1004, 'Grenada', 'gd', 100),
(100163, 1004, 'Guatemala', 'gt', 100),
(100164, 1004, 'Haiti', 'ht', 100),
(100165, 1004, 'Honduras', 'hn', 100),
(100166, 1004, 'Jamaica', 'jm', 100),
(100167, 1004, 'Mexico', 'mx', 100),
(100168, 1004, 'Nicaragua', 'ni', 100),
(100169, 1004, 'Panama', 'pa', 100),
(100170, 1004, 'Puerto Rico', 'pr', 100),
(100171, 1004, 'Saint Kitts and Nevis', 'kn', 100),
(100172, 1004, 'Saint Lucia', 'lc', 100),
(100173, 1004, 'Saint Vincent and the Grenadines', 'vc', 100),
(100174, 1004, 'Trinidad and Tobago', 'tt', 100),
(100175, 1004, 'Turks and Caicos Islands', 'tc', 100),
(100176, 1004, 'United States', 'us', 100),
(100177, 1005, 'Argentina', 'ar', 100),
(100178, 1005, 'Bolivia', 'bo', 100),
(100179, 1005, 'Brazil', 'br', 100),
(100180, 1005, 'Chile', 'cl', 100),
(100181, 1005, 'Colombia', 'co', 100),
(100182, 1005, 'Ecuador', 'ec', 100),
(100183, 1005, 'French Guiana', 'gf', 100),
(100184, 1005, 'Guyana', 'gy', 100),
(100185, 1005, 'Paraguay', 'py', 100),
(100186, 1005, 'Peru', 'pe', 100),
(100187, 1005, 'Suriname', 'sr', 100),
(100188, 1005, 'Uruguay', 'uy', 100),
(100189, 1005, 'Venezuela', 've', 100),
(100190, 1006, 'Australia', 'au', 100),
(100191, 1006, 'Micronesia', 'fm', 100),
(100192, 1006, 'Fiji', 'fj', 100),
(100193, 1006, 'Kiribati', 'ki', 100),
(100194, 1006, 'Marshall Islands', 'mh', 100),
(100195, 1006, 'Nauru', 'nr', 100),
(100196, 1006, 'New Zealand', 'nz', 100),
(100197, 1006, 'Palau', 'pw', 100),
(100198, 1006, 'Papua New Guinea', 'pg', 100),
(100199, 1006, 'Samoa', 'ws', 100),
(100200, 1006, 'Solomon Islands', 'sb', 100),
(100201, 1006, 'Tonga', 'to', 100),
(100202, 1006, 'Tuvalu', 'tv', 100),
(100203, 1006, 'Vanuatu', 'vu', 100),
(100204, 1007, 'Adélie Land', 'qd', 100),
(100205, 1007, 'British Antarctic Territory', 'qb', 100),
(100206, 1007, 'Ross Dependency', 'qr', 100),
(100207, 1007, 'Peter I Island', 'qp', 100),
(100208, 1007, 'Australian Antarctic Territory', 'qt', 100),
(100209, 1007, 'Queen Maud Land', 'qn', 100),
(100210, 1007, 'Chilean Antarctic Territory', 'qc', 100),
(100211, 1007, 'Argentine Antarctica', 'qg', 100),
(100212, 1007, 'Marie Byrd Land', 'qm', 100);

-- --------------------------------------------------------

--
-- Table structure for table `editions`
--

CREATE TABLE `editions` (
  `ediID` int(11) NOT NULL,
  `ediName` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `episodes`
--

CREATE TABLE `episodes` (
  `epiID` int(11) NOT NULL,
  `epiNumber` text DEFAULT NULL,
  `epiName` text DEFAULT NULL,
  `epiOtherName` text DEFAULT NULL,
  `epiSeasonID` int(11) DEFAULT NULL,
  `epiTypeID` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `episodetypes`
--

CREATE TABLE `episodetypes` (
  `eptID` int(11) NOT NULL,
  `eptName` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `genders`
--

CREATE TABLE `genders` (
  `gndID` int(11) NOT NULL COMMENT 'Gender ID',
  `gndName` text DEFAULT NULL COMMENT 'Gender name',
  `gndIcon` varchar(40) DEFAULT NULL COMMENT 'Gender icon',
  `gndColor` varchar(40) DEFAULT NULL COMMENT 'Gender color'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `genders`
--

INSERT INTO `genders` (`gndID`, `gndName`, `gndIcon`, `gndColor`) VALUES
(0, 'Male', 'mars', '#00bfff'),
(1, 'Female', 'venus', '#f7a8f2');

-- --------------------------------------------------------

--
-- Table structure for table `genres`
--

CREATE TABLE `genres` (
  `genID` int(11) NOT NULL COMMENT 'Genre ID',
  `genName` text DEFAULT NULL COMMENT 'Genre name',
  `genMediaTypeID` text DEFAULT NULL COMMENT 'Media Type ID'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `genres`
--

INSERT INTO `genres` (`genID`, `genName`, `genMediaTypeID`) VALUES
(200001, 'Blues', '200'),
(200002, 'Classical', '200'),
(200003, 'Country', '200'),
(200004, 'Easy Listening', '200'),
(200005, 'Electronic', '200'),
(200006, 'Folk', '200'),
(200007, 'Hip Hop', '200'),
(200008, 'Jazz', '200'),
(200009, 'Latin', '200'),
(200010, 'Metal', '200'),
(200011, 'New Age', '200'),
(200012, 'Pop', '200'),
(200013, 'Reggae', '200'),
(200014, 'Rhythm & Blues', '200'),
(200015, 'Rock', '200'),
(200016, 'World', '200');

-- --------------------------------------------------------

--
-- Table structure for table `images`
--

CREATE TABLE `images` (
  `imaID` int(11) NOT NULL,
  `imaDesignerID` text DEFAULT NULL,
  `imaTypeID` text DEFAULT NULL,
  `imaContentTypeID` text DEFAULT NULL,
  `imaEditionID` text DEFAULT NULL,
  `imaDate` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `imagetypes`
--

CREATE TABLE `imagetypes` (
  `imtID` int(11) NOT NULL,
  `imtType` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `instruments`
--

CREATE TABLE `instruments` (
  `insID` int(11) NOT NULL,
  `insName` text DEFAULT NULL,
  `insCategoryID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `instrumenttypes`
--

CREATE TABLE `instrumenttypes` (
  `intID` int(11) NOT NULL,
  `intName` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `languages`
--

CREATE TABLE `languages` (
  `lanID` int(11) NOT NULL,
  `lanName` text DEFAULT NULL,
  `lanCountryID` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `movies`
--

CREATE TABLE `movies` (
  `movID` int(11) NOT NULL,
  `movTitle` text DEFAULT NULL,
  `movGenreID` text DEFAULT NULL,
  `mobSubgenreID` text DEFAULT NULL,
  `movStudioID` text DEFAULT NULL,
  `movDirectorID` text DEFAULT NULL,
  `movProducerID` text DEFAULT NULL,
  `movComposerID` text DEFAULT NULL,
  `movSoundtrackID` text DEFAULT NULL,
  `movReleaseDate` text DEFAULT NULL,
  `movCharactersID` text DEFAULT NULL,
  `movSourceMaterialID` text DEFAULT NULL,
  `movLanguageID` text DEFAULT NULL,
  `movContinuityID` text DEFAULT NULL,
  `movSeriesID` text DEFAULT NULL,
  `movNumber` int(11) DEFAULT NULL,
  `movCountryID` text DEFAULT NULL,
  `movMediaType` text DEFAULT NULL,
  `movCoverID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `movieseries`
--

CREATE TABLE `movieseries` (
  `mosID` int(11) NOT NULL,
  `mosName` text DEFAULT NULL,
  `mosCreatorID` text DEFAULT NULL,
  `mosSourceMaterialID` text DEFAULT NULL,
  `mosMediaTypeID` text DEFAULT NULL,
  `mosCoverID` text DEFAULT NULL,
  `mosWebsites` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `occupations`
--

CREATE TABLE `occupations` (
  `occID` int(11) NOT NULL,
  `occName` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `participationtypes`
--

CREATE TABLE `participationtypes` (
  `parID` int(11) NOT NULL,
  `parName` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `performances`
--

CREATE TABLE `performances` (
  `prfID` int(11) NOT NULL,
  `prfArtistID` int(11) DEFAULT NULL,
  `prfStartDates` text DEFAULT NULL,
  `prfEndDates` text DEFAULT NULL,
  `prfRoleID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `releases`
--

CREATE TABLE `releases` (
  `relID` int(11) NOT NULL,
  `relTitle` text DEFAULT NULL,
  `relAltTitle` text DEFAULT NULL,
  `relBandID` text DEFAULT NULL,
  `relDate` text DEFAULT NULL,
  `relLabelID` text DEFAULT NULL,
  `relSubgenreID` text DEFAULT NULL,
  `relReleaseTypeID` text DEFAULT NULL,
  `relCoverID` text DEFAULT NULL,
  `relDuration` text DEFAULT NULL,
  `relProducerID` text DEFAULT NULL,
  `relEditionID` text DEFAULT NULL,
  `relTracklistID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `releasetracklists`
--

CREATE TABLE `releasetracklists` (
  `rtrID` int(11) NOT NULL,
  `rtrTrackID` text DEFAULT NULL,
  `rtrNumber` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `releasetypes`
--

CREATE TABLE `releasetypes` (
  `retID` int(11) NOT NULL,
  `retName` text DEFAULT NULL,
  `retShortName` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `roles`
--

CREATE TABLE `roles` (
  `rolID` int(11) NOT NULL,
  `rolName` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `seasons`
--

CREATE TABLE `seasons` (
  `ssnID` int(11) NOT NULL,
  `ssnSerieID` int(11) DEFAULT NULL,
  `ssnSubserieID` int(11) DEFAULT NULL,
  `ssnName` text DEFAULT NULL,
  `ssnReleaseDate` text DEFAULT NULL,
  `ssnEndingDate` text DEFAULT NULL,
  `ssnOpeningID` text DEFAULT NULL,
  `ssnEndingID` text DEFAULT NULL,
  `ssnNumber` int(11) DEFAULT NULL,
  `ssnLanguageID` text DEFAULT NULL,
  `ssnCharactersID` text DEFAULT NULL,
  `ssnCoverID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `series`
--

CREATE TABLE `series` (
  `serID` int(11) NOT NULL,
  `serName` text DEFAULT NULL,
  `serWriterID` text DEFAULT NULL,
  `serGenreID` text DEFAULT NULL,
  `serSubGenreID` text DEFAULT NULL,
  `serWebsites` text DEFAULT NULL,
  `serOtherNames` text DEFAULT NULL,
  `serDirectorID` text DEFAULT NULL,
  `serStudioID` text DEFAULT NULL,
  `serSourceMaterialID` text DEFAULT NULL,
  `serMediaTypeID` int(11) DEFAULT NULL,
  `serCoverID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `sorttypes`
--

CREATE TABLE `sorttypes` (
  `styID` int(11) NOT NULL,
  `styName` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `subgenres`
--

CREATE TABLE `subgenres` (
  `sgnID` int(11) NOT NULL COMMENT 'Subgenre ID',
  `sgnName` text DEFAULT NULL COMMENT 'Subgenre name',
  `sgnGenreID` int(10) DEFAULT NULL COMMENT 'Genre ID',
  `sgnMediaTypeID` text DEFAULT NULL COMMENT 'Media Type ID'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `subgenres`
--

INSERT INTO `subgenres` (`sgnID`, `sgnName`, `sgnGenreID`, `sgnMediaTypeID`) VALUES
(2000001, '2 Tone', 200013, '200'),
(2000002, '2-Step Garage', 200005, '200'),
(2000003, '4-Beat', 200005, '200'),
(2000004, '8-Bit', 200005, '200'),
(2000005, 'Acapella', 200004, '200'),
(2000006, 'Acid Breaks', 200005, '200'),
(2000007, 'Acid House', 200005, '200'),
(2000008, 'Acid Jazz', 200008, '200'),
(2000009, 'Acid Rock', 200015, '200'),
(2000010, 'Acid Techno', 200005, '200'),
(2000011, 'Acid Trance', 200005, '200'),
(2000012, 'Acoustic', 200004, '200'),
(2000013, 'Acousticana', 200004, '200'),
(2000014, 'Adult Contemporary', 200012, '200'),
(2000015, 'Adult Oriented Rock', 200015, '200'),
(2000016, 'African Popular', 200012, '200'),
(2000017, 'African Rumba', 200016, '200'),
(2000018, 'Afrobeat', 200008, '200'),
(2000019, 'Aleatoric', 200011, '200'),
(2000020, 'Alternative Country', 200003, '200'),
(2000021, 'Alternative Dance', 200005, '200'),
(2000022, 'Alternative Dream Pop', 200012, '200'),
(2000023, 'Alternative Hip Hop', 200007, '200'),
(2000024, 'Alternative Metal', 200010, '200'),
(2000025, 'Alternative Rock', 200015, '200'),
(2000026, 'Alternative R&B', 200014, '200'),
(2000027, 'Ambient', 200011, '200'),
(2000028, 'Ambient House', 200005, '200'),
(2000029, 'Americana', 200006, '200'),
(2000030, 'Anarcho Punk', 200015, '200'),
(2000031, 'Anime', 200006, '200'),
(2000032, 'Anti-Folk', 200006, '200'),
(2000033, 'Akpala', 200016, '200'),
(2000034, 'Apala', 200009, '200'),
(2000035, 'Arab Pop', 200012, '200'),
(2000036, 'Arabesque', 200002, '200'),
(2000037, 'Arabic Pop', 200012, '200'),
(2000038, 'Arena Rock', 200015, '200'),
(2000039, 'Argentine Rock', 200015, '200'),
(2000040, 'Ars Antiqua', 200002, '200'),
(2000041, 'Ars Nova', 200002, '200'),
(2000042, 'Art Pop', 200012, '200'),
(2000043, 'Art Punk', 200015, '200'),
(2000044, 'Art Rock', 200015, '200'),
(2000045, 'Ashiq', 200016, '200'),
(2000046, 'Asian American Jazz', 200008, '200'),
(2000047, 'Australian Country', 200003, '200'),
(2000048, 'Australian Hip Hop', 200007, '200'),
(2000049, 'Australian Pub Rock', 200015, '200'),
(2000050, 'Austropop', 200012, '200'),
(2000051, 'Avant-Garde', 200002, '200'),
(2000052, 'Avant-Garde Jazz', 200008, '200'),
(2000053, 'Avant-Garde Metal', 200010, '200'),
(2000054, 'Axé', 200013, '200'),
(2000055, 'Bac-Bal', 200016, '200'),
(2000056, 'Bachata', 200009, '200'),
(2000057, 'Background', 200011, '200'),
(2000058, 'Baggy', 200012, '200'),
(2000059, 'Baila', 200016, '200'),
(2000060, 'Baile Funk', 200014, '200'),
(2000061, 'Baisha Xiyue', 200016, '200'),
(2000062, 'Baithak Gana', 200016, '200'),
(2000063, 'Baião', 200016, '200'),
(2000064, 'Bajourou', 200016, '200'),
(2000065, 'Bakersfield Sound', 200003, '200'),
(2000066, 'Bakou', 200016, '200'),
(2000067, 'Bakshy', 200016, '200'),
(2000068, 'Bal-Musette', 200016, '200'),
(2000069, 'Balakadri', 200016, '200'),
(2000070, 'Balinese Gamelan', 200016, '200'),
(2000071, 'Balkan Pop', 200012, '200'),
(2000072, 'Ballad', 200002, '200'),
(2000073, 'Ballata', 200002, '200'),
(2000074, 'Ballet', 200002, '200'),
(2000075, 'Bamboo Band', 200016, '200'),
(2000076, 'Bambuco', 200009, '200'),
(2000077, 'Banda', 200009, '200'),
(2000078, 'Bangsawan', 200016, '200'),
(2000079, 'Bantowbol', 200016, '200'),
(2000080, 'Barbershop', 200004, '200'),
(2000081, 'Barndance', 200006, '200'),
(2000082, 'Baroque', 200002, '200'),
(2000083, 'Baroque Pop', 200012, '200'),
(2000084, 'Bass', 200005, '200'),
(2000085, 'Batcave', 200008, '200'),
(2000086, 'Batucada', 200009, '200'),
(2000087, 'Batuco', 200009, '200'),
(2000088, 'Batá-Rumba', 200009, '200'),
(2000089, 'Beach', 200012, '200'),
(2000090, 'Beat', 200012, '200'),
(2000091, 'Beatboxing', 200007, '200'),
(2000092, 'Beautiful', 200011, '200'),
(2000093, 'Bebop', 200008, '200'),
(2000094, 'Beiguan', 200016, '200'),
(2000095, 'Bel Canto', 200002, '200'),
(2000096, 'Bend-Skin', 200016, '200'),
(2000097, 'Benga', 200016, '200'),
(2000098, 'Bhajan', 200016, '200'),
(2000099, 'Bhangra', 200006, '200'),
(2000100, 'Bhangra-Wine', 200006, '200'),
(2000101, 'Bhangragga', 200013, '200'),
(2000102, 'Bhangramuffin', 200013, '200'),
(2000103, 'Big Band', 200008, '200'),
(2000104, 'Big Beat', 200005, '200'),
(2000105, 'Biguine', 200016, '200'),
(2000106, 'Bihu', 200016, '200'),
(2000107, 'Bikutsi', 200016, '200'),
(2000108, 'Biomusic', 200011, '200'),
(2000109, 'Bitcore', 200010, '200'),
(2000110, 'Bitpop', 200012, '200'),
(2000111, 'Black Metal', 200010, '200'),
(2000112, 'Blackened Death Metal', 200010, '200'),
(2000113, 'Blackgaze', 200010, '200'),
(2000114, 'Blue-Eyed Soul', 200014, '200'),
(2000115, 'Bluegrass', 200003, '200'),
(2000116, 'Blues', 200001, '200'),
(2000117, 'Blues Ballad', 200001, '200'),
(2000118, 'Blues-Rock', 200015, '200'),
(2000119, 'Bolero', 200009, '200'),
(2000120, 'Bolero Cubano', 200009, '200'),
(2000121, 'Boogie', 200014, '200'),
(2000122, 'Boogie Woogie', 200001, '200'),
(2000123, 'Bossa Nova', 200009, '200'),
(2000124, 'Brass Band', 200004, '200'),
(2000125, 'Brazilian Funk', 200014, '200'),
(2000126, 'Brazilian Jazz', 200008, '200'),
(2000127, 'Breakbeat', 200005, '200'),
(2000128, 'Breakbeat Hardcore', 200005, '200'),
(2000129, 'Breakcore', 200005, '200'),
(2000130, 'Breton', 200016, '200'),
(2000131, 'Brill Building Pop', 200012, '200'),
(2000132, 'Britfunk', 200015, '200'),
(2000133, 'British Blues', 200001, '200'),
(2000134, 'British Invasion', 200016, '200'),
(2000135, 'Britpop', 200015, '200'),
(2000136, 'Broken Beat', 200005, '200'),
(2000137, 'Brown-Eyed Soul', 200014, '200'),
(2000138, 'Brukdown', 200005, '200'),
(2000139, 'Brutal Death Metal', 200010, '200'),
(2000140, 'Bubblegum Dance', 200005, '200'),
(2000141, 'Bubblegum Pop', 200012, '200'),
(2000142, 'Bulerias', 200016, '200'),
(2000143, 'Bumba-Meu-Boi', 200016, '200'),
(2000144, 'Bunraku', 200016, '200'),
(2000145, 'Burger-Highlife', 200016, '200'),
(2000146, 'Burgundian School', 200016, '200'),
(2000147, 'Byzantine Chant', 200002, '200'),
(2000148, 'Ca Din Tulnic', 200016, '200'),
(2000149, 'Ca Pe Lunca', 200016, '200'),
(2000150, 'Ca Trù', 200016, '200'),
(2000151, 'Cabaret', 200008, '200'),
(2000152, 'Cadence', 200002, '200'),
(2000153, 'Cadence Rampa', 200016, '200'),
(2000154, 'Cadence-Lypso', 200016, '200'),
(2000155, 'Café-Aman', 200016, '200'),
(2000156, 'Cai Luong', 200016, '200'),
(2000157, 'Cajun', 200016, '200'),
(2000158, 'Cakewalk', 200016, '200'),
(2000159, 'Calenda', 200016, '200'),
(2000160, 'Calentanos', 200016, '200'),
(2000161, 'Calgija', 200016, '200'),
(2000162, 'Calypso', 200016, '200'),
(2000163, 'Calypso Jazz', 200008, '200'),
(2000164, 'Calypso-Style Baila', 200016, '200'),
(2000165, 'Campursari', 200016, '200'),
(2000166, 'Canatronic', 200016, '200'),
(2000167, 'Candombe', 200016, '200'),
(2000168, 'Canon', 200002, '200'),
(2000169, 'Canrock', 200015, '200'),
(2000170, 'Cantata', 200002, '200'),
(2000171, 'Cante Chico', 200016, '200'),
(2000172, 'Cante Jondo', 200016, '200'),
(2000173, 'Canterbury Scene', 200015, '200'),
(2000174, 'Cantiga', 200002, '200'),
(2000175, 'Cantique', 200002, '200'),
(2000176, 'Cantiñas', 200016, '200'),
(2000177, 'Canto Livre', 200016, '200'),
(2000178, 'Canto Nuevo', 200016, '200'),
(2000179, 'Canto Popular', 200016, '200'),
(2000180, 'Cantopop', 200016, '200'),
(2000181, 'Canzone Napoletana', 200016, '200'),
(2000182, 'Caña', 200016, '200'),
(2000183, 'Cape Jazz', 200008, '200'),
(2000184, 'Capoeira', 200016, '200'),
(2000185, 'Caracoles', 200016, '200'),
(2000186, 'Carceleras', 200016, '200'),
(2000187, 'Cardas', 200016, '200'),
(2000188, 'Calming Instrumental', 200011, '200'),
(2000189, 'Carimbó', 200016, '200'),
(2000190, 'Cariso', 200016, '200'),
(2000191, 'Carnatic', 200016, '200'),
(2000192, 'Carol', 200002, '200'),
(2000193, 'Carranga', 200009, '200'),
(2000194, 'Cartageneras', 200009, '200'),
(2000195, 'Cassette Culture', 200016, '200'),
(2000196, 'Casséy-Co', 200016, '200'),
(2000197, 'Cavacha', 200016, '200'),
(2000198, 'Caveman', 200016, '200'),
(2000199, 'Celempungan', 200016, '200'),
(2000200, 'Cello Metal', 200010, '200'),
(2000201, 'Cello Rock', 200015, '200'),
(2000202, 'Celtic', 200006, '200'),
(2000203, 'Celtic Fusion', 200011, '200'),
(2000204, 'Celtic Metal', 200010, '200'),
(2000205, 'Celtic Punk', 200015, '200'),
(2000206, 'Celtic Reggae', 200013, '200'),
(2000207, 'Celtic Rock', 200015, '200'),
(2000208, 'Cha-Cha-Cha', 200009, '200'),
(2000209, 'Chakacha', 200016, '200'),
(2000210, 'Chalga', 200016, '200'),
(2000211, 'Chamamé', 200016, '200'),
(2000212, 'Chamber Jazz', 200008, '200'),
(2000213, 'Chamber', 200002, '200'),
(2000214, 'Chamber Pop', 200012, '200'),
(2000215, 'Champeta', 200009, '200'),
(2000216, 'Changuí', 200009, '200'),
(2000217, 'Chanson', 200002, '200'),
(2000218, 'Chant', 200002, '200'),
(2000219, 'Charanga', 200009, '200'),
(2000220, 'Charanga-Vallenata', 200009, '200'),
(2000221, 'Charikawi', 200016, '200'),
(2000222, 'Chastushki', 200016, '200'),
(2000223, 'Chau Van', 200016, '200'),
(2000224, 'Chemical Breaks', 200005, '200'),
(2000225, 'Chicago Blues', 200001, '200'),
(2000226, 'Chicago House', 200005, '200'),
(2000227, 'Chicago Soul', 200014, '200'),
(2000228, 'Chicano Rap', 200007, '200'),
(2000229, 'Chicano Rock', 200015, '200'),
(2000230, 'Chicken Scratch', 200016, '200'),
(2000231, 'Children', 200004, '200'),
(2000232, 'Chillout', 200011, '200'),
(2000233, 'Chillwave', 200015, '200'),
(2000234, 'Chimurenga', 200016, '200'),
(2000235, 'Chinese Orchestra', 200002, '200'),
(2000236, 'Chinese Pop', 200012, '200'),
(2000237, 'Chinese Rock', 200015, '200'),
(2000238, 'Chip', 200005, '200'),
(2000239, 'Cho-Kantrum', 200016, '200'),
(2000240, 'Chongak', 200016, '200'),
(2000241, 'Chopera', 200016, '200'),
(2000242, 'Chorinho', 200016, '200'),
(2000243, 'Choro', 200016, '200'),
(2000244, 'Chouval Bwa', 200016, '200'),
(2000245, 'Chowtal', 200016, '200'),
(2000246, 'Christian', 200002, '200'),
(2000247, 'Christian Alternative', 200014, '200'),
(2000248, 'Christian Black Metal', 200010, '200'),
(2000249, 'Christian Electronic', 200005, '200'),
(2000250, 'Christian Hardcore', 200015, '200'),
(2000251, 'Christian Hip Hop', 200007, '200'),
(2000252, 'Christian Industrial', 200005, '200'),
(2000253, 'Christian Metal', 200010, '200'),
(2000254, 'Christian Punk', 200015, '200'),
(2000255, 'Christian R&B', 200014, '200'),
(2000256, 'Christian Rock', 200015, '200'),
(2000257, 'Christian Ska', 200013, '200'),
(2000258, 'Christmas', 200004, '200'),
(2000259, 'Christmas Carol', 200004, '200'),
(2000260, 'Chumba', 200016, '200'),
(2000261, 'Chut-Kai-Pang', 200016, '200'),
(2000262, 'Chutney', 200016, '200'),
(2000263, 'Chutney Soca', 200016, '200'),
(2000264, 'Chutney-Bhangra', 200016, '200'),
(2000265, 'Chutney-Hip Hop', 200007, '200'),
(2000266, 'Chutney-Soca', 200016, '200'),
(2000267, 'Chylandyk', 200016, '200'),
(2000268, 'Chzalni', 200016, '200'),
(2000269, 'Chèo', 200016, '200'),
(2000270, 'Cigányzene', 200016, '200'),
(2000271, 'Classic', 200002, '200'),
(2000272, 'Classic Country', 200003, '200'),
(2000273, 'Classic Female Blues', 200001, '200'),
(2000274, 'Classic Rock', 200015, '200'),
(2000275, 'Classical', 200002, '200'),
(2000276, 'Classical Era', 200002, '200'),
(2000277, 'Clicks N Cuts', 200005, '200'),
(2000278, 'Close Harmony', 200002, '200'),
(2000279, 'Cloud Rap', 200007, '200'),
(2000280, 'Club', 200005, '200'),
(2000281, 'Cocobale', 200016, '200'),
(2000282, 'Coimbra Fado', 200016, '200'),
(2000283, 'Coladeira', 200016, '200'),
(2000284, 'Combined Rhythm', 200016, '200'),
(2000285, 'Comedy Rap', 200007, '200'),
(2000286, 'Comedy Rock', 200015, '200'),
(2000287, 'Comic Opera', 200002, '200'),
(2000288, 'Comparsa', 200009, '200'),
(2000289, 'Compas Direct', 200016, '200'),
(2000290, 'Compas Meringue', 200016, '200'),
(2000291, 'Concert Overture', 200002, '200'),
(2000292, 'Concerto', 200002, '200'),
(2000293, 'Concerto Grosso', 200002, '200'),
(2000294, 'Congo', 200016, '200'),
(2000295, 'Conjunto', 200009, '200'),
(2000296, 'Contemporary Christian', 200014, '200'),
(2000297, 'Contemporary R&B', 200014, '200'),
(2000298, 'Contonbley', 200016, '200'),
(2000299, 'Contradanza', 200016, '200'),
(2000300, 'Cool Jazz', 200008, '200'),
(2000301, 'Corrido', 200002, '200'),
(2000302, 'Corsican Polyphonic Song', 200006, '200'),
(2000303, 'Cothoza Mfana', 200016, '200'),
(2000304, 'Country', 200003, '200'),
(2000305, 'Country Blues', 200001, '200'),
(2000306, 'Country Gospel', 200014, '200'),
(2000307, 'Country Pop', 200012, '200'),
(2000308, 'Country R&B', 200014, '200'),
(2000309, 'Country Rock', 200015, '200'),
(2000310, 'Country Rap', 200007, '200'),
(2000311, 'Countrypolitan', 200003, '200'),
(2000312, 'Couple de Sonneurs', 200016, '200'),
(2000313, 'Coupé-Décalé', 200016, '200'),
(2000314, 'Cowpunk', 200015, '200'),
(2000315, 'Cretan', 200016, '200'),
(2000316, 'Crossover', 200012, '200'),
(2000317, 'Crossover Jazz', 200008, '200'),
(2000318, 'Crossover Rock', 200015, '200'),
(2000319, 'Crossover Thrash Metal', 200010, '200'),
(2000320, 'Crunk', 200007, '200'),
(2000321, 'Crunk&B', 200014, '200'),
(2000322, 'Crunkcore', 200010, '200'),
(2000323, 'Crust Punk', 200015, '200'),
(2000324, 'Csárdás', 200016, '200'),
(2000325, 'Cuarteto', 200009, '200'),
(2000326, 'Cuban Rumba', 200009, '200'),
(2000327, 'Cuddlecore', 200012, '200'),
(2000328, 'Cueca', 200009, '200'),
(2000329, 'Cumbia', 200009, '200'),
(2000330, 'Cumbia Villera', 200009, '200'),
(2000331, 'Cybergrind', 200010, '200'),
(2000332, 'Dabka', 200006, '200'),
(2000333, 'Dadra', 200016, '200'),
(2000334, 'Daina', 200006, '200'),
(2000335, 'Dalauna', 200016, '200'),
(2000336, 'Dance', 200006, '200'),
(2000337, 'Dance-Pop', 200012, '200'),
(2000338, 'Dance-Punk', 200015, '200'),
(2000339, 'Dance-Rock', 200015, '200'),
(2000340, 'Dancehall', 200013, '200'),
(2000341, 'Dangdut', 200016, '200'),
(2000342, 'Danger', 200005, '200'),
(2000343, 'Dansband', 200006, '200'),
(2000344, 'Danza', 200009, '200'),
(2000345, 'Danzón', 200009, '200'),
(2000346, 'Dark Ambient', 200011, '200'),
(2000347, 'Dark Cabaret', 200006, '200'),
(2000348, 'Dark Folk', 200006, '200'),
(2000349, 'Dark Pop', 200012, '200'),
(2000350, 'Dark Rock', 200015, '200'),
(2000351, 'Dark Salsa', 200009, '200'),
(2000352, 'Darkcore', 200005, '200'),
(2000353, 'Darkstep', 200005, '200'),
(2000354, 'Darkwave', 200005, '200'),
(2000355, 'Death Industrial', 200005, '200'),
(2000356, 'Death Metal', 200010, '200'),
(2000357, 'Death Rock', 200015, '200'),
(2000358, 'Death-Doom', 200010, '200'),
(2000359, 'Deathcore', 200010, '200'),
(2000360, 'Deathgrind', 200010, '200'),
(2000361, 'DeathR&B', 200014, '200'),
(2000362, 'Deep Funk', 200014, '200'),
(2000363, 'Deep House', 200005, '200'),
(2000364, 'Deep Soul', 200014, '200'),
(2000365, 'Degung', 200016, '200'),
(2000366, 'Delta Blues', 200001, '200'),
(2000367, 'Dementia', 200016, '200'),
(2000368, 'Desert Rock', 200015, '200'),
(2000369, 'Desi', 200016, '200'),
(2000370, 'Detroit Blues', 200001, '200'),
(2000371, 'Detroit Techno', 200005, '200'),
(2000372, 'Dhamar', 200016, '200'),
(2000373, 'Dhimotiká', 200016, '200'),
(2000374, 'Dhrupad', 200016, '200'),
(2000375, 'Dhun', 200016, '200'),
(2000376, 'Digital Hardcore', 200005, '200'),
(2000377, 'Dirge', 200002, '200'),
(2000378, 'Dirty Dutch', 200016, '200'),
(2000379, 'Dirty Rap', 200007, '200'),
(2000380, 'Dirty South', 200007, '200'),
(2000381, 'Disco', 200005, '200'),
(2000382, 'Disco House', 200005, '200'),
(2000383, 'Disco Polo', 200005, '200'),
(2000384, 'Disney', 200004, '200'),
(2000385, 'Disney Pop', 200012, '200'),
(2000386, 'Disney Rock', 200015, '200'),
(2000387, 'Diva House', 200005, '200'),
(2000388, 'Divine Rock', 200015, '200'),
(2000389, 'Dixieland', 200008, '200'),
(2000390, 'Dixieland Jazz', 200008, '200'),
(2000391, 'Djambadon', 200016, '200'),
(2000392, 'Djent', 200010, '200'),
(2000393, 'Dodompa', 200016, '200'),
(2000394, 'Doina', 200016, '200'),
(2000395, 'Dombola', 200016, '200'),
(2000396, 'Dondang Sayang', 200016, '200'),
(2000397, 'Donegal Fiddle Tradition', 200006, '200'),
(2000398, 'Dongjing', 200016, '200'),
(2000399, 'Doo Wop', 200014, '200'),
(2000400, 'Doom Metal', 200010, '200'),
(2000401, 'Doomcore', 200005, '200'),
(2000402, 'Downtempo', 200005, '200'),
(2000403, 'Downtempo Pop', 200012, '200'),
(2000404, 'Drag', 200005, '200'),
(2000405, 'Dream Pop', 200012, '200'),
(2000406, 'Drone', 200005, '200'),
(2000407, 'Drone Doom', 200005, '200'),
(2000408, 'Drone Metal', 200010, '200'),
(2000409, 'Dronology', 200005, '200'),
(2000410, 'Drum and Bass', 200005, '200'),
(2000411, 'Dub', 200005, '200'),
(2000412, 'Dub House', 200005, '200'),
(2000413, 'Dubanguthu', 200016, '200'),
(2000414, 'Dubstep', 200005, '200'),
(2000415, 'Dubtronica', 200005, '200'),
(2000416, 'Dunedin Sound', 200012, '200'),
(2000417, 'Dunun', 200016, '200'),
(2000418, 'Dutch Jazz', 200008, '200'),
(2000419, 'Décima', 200009, '200'),
(2000420, 'Early', 200002, '200'),
(2000421, 'East Coast Blues', 200001, '200'),
(2000422, 'East Coast Hip Hop', 200007, '200'),
(2000423, 'Easy Listening', 200004, '200'),
(2000424, 'Electric Blues', 200001, '200'),
(2000425, 'Electric Folk', 200006, '200'),
(2000426, 'Electro', 200005, '200'),
(2000427, 'Electro Backbeat', 200005, '200'),
(2000428, 'Electro Hop', 200007, '200'),
(2000429, 'Electro House', 200005, '200'),
(2000430, 'Electro Punk', 200015, '200'),
(2000431, 'Electro-Indie', 200005, '200'),
(2000432, 'Electro-Industrial', 200005, '200'),
(2000433, 'Electro-Swing', 200005, '200'),
(2000434, 'Electroclash', 200005, '200'),
(2000435, 'Electrofunk', 200005, '200'),
(2000436, 'Electronic', 200005, '200'),
(2000437, 'Electronic Art', 200005, '200'),
(2000438, 'Electronic Body', 200005, '200'),
(2000439, 'Electronic Dance', 200005, '200'),
(2000440, 'Electronic Luk Thung', 200005, '200'),
(2000441, 'Electronic Rock', 200015, '200'),
(2000442, 'Electronica', 200005, '200'),
(2000443, 'Electropop', 200012, '200'),
(2000444, 'Elevator', 200004, '200'),
(2000445, 'Emo', 200015, '200'),
(2000446, 'Emo Pop', 200012, '200'),
(2000447, 'Emo Rap', 200007, '200'),
(2000448, 'Emocore', 200015, '200'),
(2000449, 'Emotronic', 200005, '200'),
(2000450, 'Enka', 200016, '200'),
(2000451, 'Eremwu Eu', 200016, '200'),
(2000452, 'Essential Rock', 200015, '200'),
(2000453, 'Ethereal Pop', 200012, '200'),
(2000454, 'Ethereal Wave', 200005, '200'),
(2000455, 'Euro', 200012, '200'),
(2000456, 'Euro Disco', 200005, '200'),
(2000457, 'Eurobeat', 200005, '200'),
(2000458, 'Eurodance', 200005, '200'),
(2000459, 'Europop', 200012, '200'),
(2000460, 'Eurotrance', 200005, '200'),
(2000461, 'Eurourban', 200014, '200'),
(2000462, 'Exotica', 200008, '200'),
(2000463, 'Experimental', 200005, '200'),
(2000464, 'Experimental Noise', 200005, '200'),
(2000465, 'Experimental Pop', 200012, '200'),
(2000466, 'Experimental Rock', 200015, '200'),
(2000467, 'Extreme Metal', 200010, '200'),
(2000468, 'Ezengileer', 200004, '200'),
(2000469, 'Fado', 200016, '200'),
(2000470, 'Falak', 200016, '200'),
(2000471, 'Fandango', 200006, '200'),
(2000472, 'Farruca', 200006, '200'),
(2000473, 'Fife and Drum Blues', 200001, '200'),
(2000474, 'Filk', 200006, '200'),
(2000475, 'Film Score', 200011, '200'),
(2000476, 'Filmi', 200016, '200'),
(2000477, 'Filmi-Ghazal', 200016, '200'),
(2000478, 'Finger-Style', 200004, '200'),
(2000479, 'Fjatpangarri', 200016, '200'),
(2000480, 'Flamenco', 200016, '200'),
(2000481, 'Flamenco Rumba', 200016, '200'),
(2000482, 'Flower Power', 200006, '200'),
(2000483, 'Foaie Verde', 200016, '200'),
(2000484, 'Fofa', 200016, '200'),
(2000485, 'Folk Hop', 200007, '200'),
(2000486, 'Folk Metal', 200010, '200'),
(2000487, 'Folk', 200006, '200'),
(2000488, 'Folk Pop', 200012, '200'),
(2000489, 'Folk Punk', 200015, '200'),
(2000490, 'Folk Rock', 200015, '200'),
(2000491, 'Folktronica', 200005, '200'),
(2000492, 'Forró', 200009, '200'),
(2000493, 'Franco-Country', 200016, '200'),
(2000494, 'Freak-Folk', 200006, '200'),
(2000495, 'Freakbeat', 200015, '200'),
(2000496, 'Free', 200004, '200'),
(2000497, 'Free Improvisation', 200004, '200'),
(2000498, 'Free Jazz', 200008, '200'),
(2000499, 'Freestyle', 200007, '200'),
(2000500, 'Freestyle House', 200005, '200'),
(2000501, 'Freetekno', 200005, '200'),
(2000502, 'French House', 200005, '200'),
(2000503, 'French Pop', 200012, '200'),
(2000504, 'Frenchcore', 200005, '200'),
(2000505, 'Frevo', 200009, '200'),
(2000506, 'Fricote', 200016, '200'),
(2000507, 'Fuji', 200016, '200'),
(2000508, 'Fuji Modern', 200016, '200'),
(2000509, 'Fulia', 200016, '200'),
(2000510, 'Full On', 200005, '200'),
(2000511, 'Funaná', 200016, '200'),
(2000512, 'Funeral Doom', 200010, '200'),
(2000513, 'Funk', 200014, '200'),
(2000514, 'Funk Metal', 200010, '200'),
(2000515, 'Funk Rock', 200015, '200'),
(2000516, 'Funkcore', 200005, '200'),
(2000517, 'Funky House', 200005, '200'),
(2000518, 'Furniture', 200016, '200'),
(2000519, 'Fusion Jazz', 200008, '200'),
(2000520, 'G-Funk', 200007, '200'),
(2000521, 'Gaana', 200016, '200'),
(2000522, 'Gabba', 200005, '200'),
(2000523, 'Gabber', 200005, '200'),
(2000524, 'Gagaku', 200002, '200'),
(2000525, 'Gaikyoku', 200016, '200'),
(2000526, 'Gaita Zuliana', 200009, '200'),
(2000527, 'Galant', 200002, '200'),
(2000528, 'Gamad', 200016, '200'),
(2000529, 'Gambang Kromong', 200016, '200'),
(2000530, 'Gamelan', 200016, '200'),
(2000531, 'Gamelan Angklung', 200016, '200'),
(2000532, 'Gamelan Bang', 200016, '200'),
(2000533, 'Gamelan Bebonangan', 200016, '200'),
(2000534, 'Gamelan Buh', 200016, '200'),
(2000535, 'Gamelan Degung', 200016, '200'),
(2000536, 'Gamelan Gede', 200016, '200'),
(2000537, 'Gamelan Kebyar', 200016, '200'),
(2000538, 'Gamelan Salendro', 200016, '200'),
(2000539, 'Gamelan Selunding', 200016, '200'),
(2000540, 'Gamelan Semar Pegulingan', 200016, '200'),
(2000541, 'Gamewave', 200005, '200'),
(2000542, 'Gammeldans', 200006, '200'),
(2000543, 'Gandrung', 200006, '200'),
(2000544, 'Gangsta Rap', 200007, '200'),
(2000545, 'Gar', 200016, '200'),
(2000546, 'Garage House', 200005, '200'),
(2000547, 'Garage Rock', 200015, '200'),
(2000548, 'Garrotin', 200016, '200'),
(2000549, 'Gavotte', 200006, '200'),
(2000550, 'Gelugpa Chanting', 200016, '200'),
(2000551, 'Gender Wayang', 200016, '200'),
(2000552, 'Gending', 200016, '200'),
(2000553, 'German Folk', 200006, '200'),
(2000554, 'Gharbi', 200016, '200'),
(2000555, 'Gharnati', 200016, '200'),
(2000556, 'Ghazal', 200016, '200'),
(2000557, 'Ghazal-Song', 200016, '200'),
(2000558, 'Ghetto House', 200005, '200'),
(2000559, 'Ghettotech', 200005, '200'),
(2000560, 'Glam Metal', 200010, '200'),
(2000561, 'Glam Punk', 200015, '200'),
(2000562, 'Glam Rock', 200015, '200'),
(2000563, 'Glitch', 200005, '200'),
(2000564, 'Gnawa', 200016, '200'),
(2000565, 'Go-Go', 200008, '200'),
(2000566, 'Goa', 200016, '200'),
(2000567, 'Goa Trance', 200005, '200'),
(2000568, 'Gong-Chime', 200016, '200'),
(2000569, 'Goombay', 200016, '200'),
(2000570, 'Goregrind', 200010, '200'),
(2000571, 'Goshu Ondo', 200016, '200'),
(2000572, 'Gospel', 200002, '200'),
(2000573, 'Gothabilly', 200015, '200'),
(2000574, 'Gothic Metal', 200010, '200'),
(2000575, 'Gothic Rock', 200015, '200'),
(2000576, 'Granadinas', 200016, '200'),
(2000577, 'Grebo', 200015, '200'),
(2000578, 'Gregorian Chant', 200002, '200'),
(2000579, 'Grime', 200005, '200'),
(2000580, 'Grindcore', 200010, '200'),
(2000581, 'Groove Metal', 200010, '200'),
(2000582, 'Group Sounds', 200015, '200'),
(2000583, 'Grunge', 200015, '200'),
(2000584, 'Grupera', 200009, '200'),
(2000585, 'Guaguanbo', 200016, '200'),
(2000586, 'Guajira', 200009, '200'),
(2000587, 'Guasca', 200009, '200'),
(2000588, 'Guitarra Baiana', 200009, '200'),
(2000589, 'Guitarradas', 200016, '200'),
(2000590, 'Gumbay', 200016, '200'),
(2000591, 'Gumbe', 200016, '200'),
(2000592, 'Gunchei', 200016, '200'),
(2000593, 'Gunka', 200016, '200'),
(2000594, 'Guoyue', 200016, '200'),
(2000595, 'Gwo Ka', 200016, '200'),
(2000596, 'Gwo Ka Moderne', 200016, '200'),
(2000597, 'Gypsy Jazz', 200008, '200'),
(2000598, 'Gypsy Punk', 200015, '200'),
(2000599, 'Gypsy', 200006, '200'),
(2000600, 'Gyu Ke', 200016, '200'),
(2000601, 'Habanera', 200016, '200'),
(2000602, 'Hajnali', 200016, '200'),
(2000603, 'Hakka', 200016, '200'),
(2000604, 'Halling', 200016, '200'),
(2000605, 'Hambo', 200016, '200'),
(2000606, 'Hands Up', 200005, '200'),
(2000607, 'Hapa Haole', 200016, '200'),
(2000608, 'Happy Hardcore', 200005, '200'),
(2000609, 'Haqibah', 200016, '200'),
(2000610, 'Hard', 200005, '200'),
(2000611, 'Hard Bop', 200008, '200'),
(2000612, 'Hard House', 200005, '200'),
(2000613, 'Hard Rock', 200015, '200'),
(2000614, 'Hard Trance', 200005, '200'),
(2000615, 'Hardcore Hip Hop', 200007, '200'),
(2000616, 'Hardcore Metal', 200010, '200'),
(2000617, 'Hardcore Punk', 200015, '200'),
(2000618, 'Hardcore Techno', 200005, '200'),
(2000619, 'Hardstyle', 200005, '200'),
(2000620, 'Harepa', 200016, '200'),
(2000621, 'Harmonica Blues', 200001, '200'),
(2000622, 'Hasaposérviko', 200006, '200'),
(2000623, 'Hawaiian', 200006, '200'),
(2000624, 'Heartland Rock', 200015, '200'),
(2000625, 'Heavy Beat', 200005, '200'),
(2000626, 'Heavy Metal', 200010, '200'),
(2000627, 'Hesher', 200016, '200'),
(2000628, 'Hi-NRG', 200005, '200'),
(2000629, 'Highlands', 200016, '200'),
(2000630, 'Highlife', 200011, '200'),
(2000631, 'Highlife Fusion', 200011, '200'),
(2000632, 'Hillbilly', 200003, '200'),
(2000633, 'Hindustani Classical', 200016, '200'),
(2000634, 'Hip Hop', 200007, '200'),
(2000635, 'Hip Hop Soul', 200007, '200'),
(2000636, 'Hip House', 200005, '200'),
(2000637, 'Hiplife', 200016, '200'),
(2000638, 'Hiragasy', 200016, '200'),
(2000639, 'Hiva Usu', 200016, '200'),
(2000640, 'Hong Kong Cantonese Pop', 200006, '200'),
(2000641, 'Hong Kong English Pop', 200012, '200'),
(2000642, 'Honky-tonk', 200003, '200'),
(2000643, 'Honkyoku', 200016, '200'),
(2000644, 'Hora Lunga', 200006, '200'),
(2000645, 'Hornpipe', 200006, '200'),
(2000646, 'Horror Punk', 200015, '200'),
(2000647, 'Horrorcore', 200007, '200'),
(2000648, 'Horrorcore Rap', 200007, '200'),
(2000649, 'House', 200005, '200'),
(2000650, 'Hua\'er', 200016, '200'),
(2000651, 'Huasteco', 200009, '200'),
(2000652, 'Huayno', 200009, '200'),
(2000653, 'Hula', 200006, '200'),
(2000654, 'Humppa', 200016, '200'),
(2000655, 'Hunguhungu', 200016, '200'),
(2000656, 'Hyangak', 200016, '200'),
(2000657, 'Hymn', 200002, '200'),
(2000658, 'Hyphy', 200007, '200'),
(2000659, 'Hypnagogic Rock', 200015, '200'),
(2000660, 'Hát Chau Van', 200016, '200'),
(2000661, 'Hát Chèo', 200016, '200'),
(2000662, 'Hát Cãi Luong', 200016, '200'),
(2000663, 'Hát Tuồng', 200016, '200'),
(2000664, 'Ibiza', 200016, '200'),
(2000665, 'Icaro', 200006, '200'),
(2000666, 'IDM', 200005, '200'),
(2000667, 'Igbo', 200016, '200'),
(2000668, 'Ijexá', 200016, '200'),
(2000669, 'Ilahije', 200016, '200'),
(2000670, 'Illbient', 200005, '200'),
(2000671, 'Impressionist', 200002, '200'),
(2000672, 'Improvisational', 200004, '200'),
(2000673, 'Incidental', 200011, '200'),
(2000674, 'Indian Pop', 200012, '200'),
(2000675, 'Indie', 200006, '200'),
(2000676, 'Indie Folk', 200006, '200'),
(2000677, 'Indie Pop', 200012, '200'),
(2000678, 'Indie Rock', 200015, '200'),
(2000679, 'Indietronica', 200005, '200'),
(2000680, 'Indo Jazz', 200008, '200'),
(2000681, 'Indo Rock', 200015, '200'),
(2000682, 'Indonesian Pop', 200012, '200'),
(2000683, 'Indoyíftika', 200016, '200'),
(2000684, 'Industrial', 200005, '200'),
(2000685, 'Industrial Death Metal', 200010, '200'),
(2000686, 'Industrial Hip-Hop', 200007, '200'),
(2000687, 'Industrial Metal', 200010, '200'),
(2000688, 'Industrial Rock', 200015, '200'),
(2000689, 'Instrumental Rock', 200015, '200'),
(2000690, 'Intelligent Dance', 200005, '200'),
(2000691, 'International Latin', 200009, '200'),
(2000692, 'Inuit', 200016, '200'),
(2000693, 'Iranian Pop', 200012, '200'),
(2000694, 'Irish Folk', 200006, '200'),
(2000695, 'Irish Rebel', 200006, '200'),
(2000696, 'Iscathamiya', 200016, '200'),
(2000697, 'Isicathamiya', 200016, '200'),
(2000698, 'Isikhwela Jo', 200016, '200'),
(2000699, 'Island', 200016, '200'),
(2000700, 'Isolationist', 200005, '200'),
(2000701, 'Italo Dance', 200005, '200'),
(2000702, 'Italo Disco', 200005, '200'),
(2000703, 'Italo House', 200005, '200'),
(2000704, 'Istmeños', 200009, '200'),
(2000705, 'J\'ouvert', 200006, '200'),
(2000706, 'J-Fusion', 200005, '200'),
(2000707, 'J-Pop', 200012, '200'),
(2000708, 'J-Rock', 200015, '200'),
(2000709, 'Jaipongan', 200006, '200'),
(2000710, 'Jaliscienses', 200009, '200'),
(2000711, 'Jam Band', 200008, '200'),
(2000712, 'Jam Rock', 200015, '200'),
(2000713, 'Jamana Kura', 200016, '200'),
(2000714, 'Jamrieng Samai', 200016, '200'),
(2000715, 'Jangle Pop', 200012, '200'),
(2000716, 'Japanese Pop', 200012, '200'),
(2000717, 'Jarana', 200009, '200'),
(2000718, 'Jariang', 200016, '200'),
(2000719, 'Jarochos', 200009, '200'),
(2000720, 'Jawaiian', 200013, '200'),
(2000721, 'Jazz', 200008, '200'),
(2000722, 'Jazz Blues', 200001, '200'),
(2000723, 'Jazz Funk', 200014, '200'),
(2000724, 'Jazz Fusion', 200008, '200'),
(2000725, 'Jazz Metal', 200010, '200'),
(2000726, 'Jazz Rap', 200007, '200'),
(2000727, 'Jazz Rock', 200015, '200'),
(2000728, 'Jegog', 200016, '200'),
(2000729, 'Jenkka', 200006, '200'),
(2000730, 'Jibaro', 200009, '200'),
(2000731, 'Jig', 200006, '200'),
(2000732, 'Jig Punk', 200015, '200'),
(2000733, 'Jing Ping', 200006, '200'),
(2000734, 'Jingle', 200004, '200'),
(2000735, 'Jit', 200016, '200'),
(2000736, 'Jitterbug', 200014, '200'),
(2000737, 'Jive', 200009, '200'),
(2000738, 'Joged', 200016, '200'),
(2000739, 'Joged Bumbung', 200016, '200'),
(2000740, 'Joik', 200016, '200'),
(2000741, 'Joik Luohti', 200016, '200'),
(2000742, 'Joropo', 200009, '200'),
(2000743, 'Jota', 200006, '200'),
(2000744, 'Jtek', 200016, '200'),
(2000745, 'Jug Band', 200014, '200'),
(2000746, 'Jujitsu', 200016, '200'),
(2000747, 'Juke Joint Blues', 200001, '200'),
(2000748, 'Jump Blues', 200001, '200'),
(2000749, 'Jumpstyle', 200005, '200'),
(2000750, 'Jungle', 200005, '200'),
(2000751, 'Junkanoo', 200016, '200'),
(2000752, 'Juré', 200016, '200'),
(2000753, 'Jùjú', 200016, '200'),
(2000754, 'K-Pop', 200012, '200'),
(2000755, 'Kaba', 200016, '200'),
(2000756, 'Kabuki', 200002, '200'),
(2000757, 'Kachāshī', 200006, '200'),
(2000758, 'Kadans', 200009, '200'),
(2000759, 'Kagok', 200004, '200'),
(2000760, 'Kagyupa Chanting', 200016, '200'),
(2000761, 'Kaiso', 200016, '200'),
(2000762, 'Kalamatianó', 200016, '200'),
(2000763, 'Kalattuut', 200016, '200'),
(2000764, 'Kalinda', 200006, '200'),
(2000765, 'Kamba Pop', 200016, '200'),
(2000766, 'Kan Ha Diskan', 200006, '200'),
(2000767, 'Kansas City Blues', 200001, '200'),
(2000768, 'Kantrum', 200006, '200'),
(2000769, 'Kantádhes', 200006, '200'),
(2000770, 'Kargyraa', 200016, '200'),
(2000771, 'Karma', 200016, '200'),
(2000772, 'Kaseko', 200006, '200'),
(2000773, 'Katajjaq', 200016, '200'),
(2000774, 'Kawachi Ondo', 200006, '200'),
(2000775, 'Kawaii Metal', 200010, '200'),
(2000776, 'Kayōkyoku', 200006, '200'),
(2000777, 'Ke-Kwe', 200016, '200'),
(2000778, 'Kebyar', 200016, '200'),
(2000779, 'Kecak', 200016, '200'),
(2000780, 'Kecapi Suling', 200016, '200'),
(2000781, 'Kertok', 200016, '200'),
(2000782, 'Khaleeji', 200006, '200'),
(2000783, 'Khap', 200016, '200'),
(2000784, 'Khelimaski Djili', 200016, '200'),
(2000785, 'Khene', 200016, '200'),
(2000786, 'Khoomei', 200006, '200'),
(2000787, 'Khorovodi', 200016, '200'),
(2000788, 'Khplam Wai', 200016, '200'),
(2000789, 'Khrung Sai', 200016, '200'),
(2000790, 'Khyal', 200016, '200'),
(2000791, 'Kilapanda', 200016, '200'),
(2000792, 'Kinko', 200016, '200'),
(2000793, 'Kirtan', 200006, '200'),
(2000794, 'Kiwi Rock', 200015, '200'),
(2000795, 'Kizomba', 200016, '200'),
(2000796, 'Klape', 200006, '200'),
(2000797, 'Klasik', 200016, '200'),
(2000798, 'Klezmer', 200006, '200'),
(2000799, 'Kliningan', 200016, '200'),
(2000800, 'Kléftiko', 200016, '200'),
(2000801, 'Kochare', 200016, '200'),
(2000802, 'Kolomyjka', 200006, '200'),
(2000803, 'Komagaku', 200006, '200'),
(2000804, 'Kompa', 200016, '200'),
(2000805, 'Korean Pop', 200012, '200'),
(2000806, 'Korean Rock', 200015, '200'),
(2000807, 'Koumpaneia', 200016, '200'),
(2000808, 'Kpanlogo', 200006, '200'),
(2000809, 'Krakowiak', 200006, '200'),
(2000810, 'Krautrock', 200015, '200'),
(2000811, 'Kriti', 200016, '200'),
(2000812, 'Kroncong', 200016, '200'),
(2000813, 'Krump', 200005, '200'),
(2000814, 'Krzesany', 200004, '200'),
(2000815, 'Kuduro', 200016, '200'),
(2000816, 'Kulintang', 200016, '200'),
(2000817, 'Kulning', 200016, '200'),
(2000818, 'Kumina', 200016, '200'),
(2000819, 'Kun-Borrk', 200006, '200'),
(2000820, 'Kundere', 200016, '200'),
(2000821, 'Kundiman', 200006, '200'),
(2000822, 'Kussundé', 200016, '200'),
(2000823, 'Kutumba Wake', 200016, '200'),
(2000824, 'Kveding', 200016, '200'),
(2000825, 'Kvæði', 200016, '200'),
(2000826, 'Kwaito', 200016, '200'),
(2000827, 'Kwassa Kwassa', 200016, '200'),
(2000828, 'Kwela', 200016, '200'),
(2000829, 'Käng', 200016, '200'),
(2000830, 'Kélé', 200016, '200'),
(2000831, 'Kĩkũyũ Pop', 200016, '200'),
(2000832, 'Lament', 200002, '200'),
(2000833, 'Latin Jazz', 200008, '200'),
(2000834, 'Latin Pop', 200012, '200'),
(2000835, 'Latin Rap', 200007, '200'),
(2000836, 'Latin Rock', 200015, '200'),
(2000837, 'Lavway', 200016, '200'),
(2000838, 'Laïko', 200016, '200'),
(2000839, 'Le Leagan', 200016, '200'),
(2000840, 'Legényes', 200016, '200'),
(2000841, 'Lelio', 200002, '200'),
(2000842, 'Letkajenkka', 200016, '200'),
(2000843, 'Levenslied', 200006, '200'),
(2000844, 'Lhamo', 200006, '200'),
(2000845, 'Lied', 200006, '200'),
(2000846, 'Light', 200002, '200'),
(2000847, 'Light Rock', 200015, '200'),
(2000848, 'Light Metal', 200010, '200'),
(2000849, 'Likanos', 200016, '200'),
(2000850, 'Liquid Drum&Bass', 200005, '200'),
(2000851, 'Liquid Funk', 200014, '200'),
(2000852, 'Liquindi', 200016, '200'),
(2000853, 'Live', 200016, '200'),
(2000854, 'Llanera', 200009, '200'),
(2000855, 'Llanto', 200016, '200'),
(2000856, 'Lo-Fi', 200005, '200'),
(2000857, 'Lofi Hip Hop', 200007, '200'),
(2000858, 'Long-Song', 200016, '200'),
(2000859, 'Louisiana Blues', 200001, '200'),
(2000860, 'Louisiana Swamp Pop', 200012, '200'),
(2000861, 'Lounge', 200004, '200'),
(2000862, 'Lovers Rock', 200015, '200'),
(2000863, 'Lowercase', 200005, '200'),
(2000864, 'Lubbock Sound', 200003, '200'),
(2000865, 'Lucknavi Thumri', 200016, '200'),
(2000866, 'Luhya Omutibo', 200016, '200'),
(2000867, 'Luk Grung', 200016, '200'),
(2000868, 'Lullaby', 200004, '200'),
(2000869, 'Lundu', 200016, '200'),
(2000870, 'Lundum', 200016, '200'),
(2000871, 'M-Base', 200009, '200'),
(2000872, 'Madchester', 200015, '200'),
(2000873, 'Madrigal', 200002, '200'),
(2000874, 'Mafioso Rap', 200007, '200'),
(2000875, 'Maglaal', 200016, '200'),
(2000876, 'Magnificat', 200002, '200'),
(2000877, 'Mahori', 200016, '200'),
(2000878, 'Mainstream Jazz', 200008, '200'),
(2000879, 'Makossa', 200016, '200'),
(2000880, 'Makossa-Soukous', 200016, '200'),
(2000881, 'Malagueña', 200009, '200'),
(2000882, 'Malawian Jazz', 200008, '200'),
(2000883, 'Malhun', 200016, '200'),
(2000884, 'Maloya', 200016, '200'),
(2000885, 'Maluf', 200016, '200'),
(2000886, 'Maluka', 200016, '200'),
(2000887, 'Mambo', 200009, '200'),
(2000888, 'Manaschi', 200016, '200'),
(2000889, 'Mandarin Pop', 200012, '200'),
(2000890, 'Manding Swing', 200016, '200'),
(2000891, 'Mangue Bit', 200009, '200'),
(2000892, 'Mangulina', 200009, '200'),
(2000893, 'Manikay', 200016, '200'),
(2000894, 'Manila Sound', 200006, '200'),
(2000895, 'Manouche', 200016, '200'),
(2000896, 'Manzuma', 200016, '200'),
(2000897, 'Mapouka', 200016, '200'),
(2000898, 'Mapouka-Serré', 200016, '200'),
(2000899, 'Marabi', 200006, '200'),
(2000900, 'Maracatu', 200009, '200'),
(2000901, 'Marga', 200016, '200'),
(2000902, 'Mariachi', 200009, '200'),
(2000903, 'Marimba', 200009, '200'),
(2000904, 'Marinera', 200009, '200'),
(2000905, 'Marrabenta', 200006, '200'),
(2000906, 'Martial Industrial', 200005, '200'),
(2000907, 'Martinetes', 200016, '200'),
(2000908, 'Maskanda', 200006, '200'),
(2000909, 'Mass', 200002, '200'),
(2000910, 'Matamuerte', 200009, '200'),
(2000911, 'Math Rock', 200015, '200'),
(2000912, 'Mathcore', 200010, '200'),
(2000913, 'Matabello', 200016, '200'),
(2000914, 'Maxixe', 200009, '200'),
(2000915, 'Mazurka', 200006, '200'),
(2000916, 'Mbalax', 200006, '200'),
(2000917, 'Mbaqanga', 200016, '200'),
(2000918, 'Mbube', 200016, '200'),
(2000919, 'Mbumba', 200016, '200'),
(2000920, 'Medh', 200016, '200'),
(2000921, 'Medieval Folk Rock', 200015, '200'),
(2000922, 'Medieval Metal', 200010, '200'),
(2000923, 'Medieval', 200002, '200'),
(2000924, 'Meditation', 200011, '200'),
(2000925, 'Mejorana', 200006, '200'),
(2000926, 'Melhoun', 200016, '200'),
(2000927, 'Melodic', 200002, '200'),
(2000928, 'Melodic Black Metal', 200010, '200'),
(2000929, 'Melodic Death Metal', 200010, '200'),
(2000930, 'Melodic Hardcore', 200010, '200'),
(2000931, 'Melodic Metalcore', 200010, '200'),
(2000932, 'Melodic Trance', 200005, '200'),
(2000933, 'Memphis Blues', 200001, '200'),
(2000934, 'Memphis Rap', 200007, '200'),
(2000935, 'Memphis Soul', 200014, '200'),
(2000936, 'Mento', 200013, '200'),
(2000937, 'Merengue', 200009, '200'),
(2000938, 'Merengue Típico Moderno', 200009, '200'),
(2000939, 'Merengue-Bomba', 200009, '200'),
(2000940, 'Merseybeat', 200015, '200'),
(2000941, 'Metal', 200010, '200'),
(2000942, 'Metalcore', 200010, '200'),
(2000943, 'Metallic Hardcore', 200010, '200'),
(2000944, 'Mexican Pop', 200012, '200'),
(2000945, 'Mexican Rock', 200015, '200'),
(2000946, 'Mexican Son', 200009, '200'),
(2000947, 'Meykhana', 200006, '200'),
(2000948, 'Mezwed', 200016, '200'),
(2000949, 'Miami Bass', 200007, '200'),
(2000950, 'Microhouse', 200005, '200'),
(2000951, 'Midwest Hip Hop', 200007, '200'),
(2000952, 'Milonga', 200009, '200'),
(2000953, 'Min yo', 200016, '200'),
(2000954, 'Mineras', 200009, '200'),
(2000955, 'Mini Compas', 200009, '200'),
(2000956, 'Mini-Jazz', 200008, '200'),
(2000957, 'Minimal Techno', 200005, '200'),
(2000958, 'Minimalist', 200011, '200'),
(2000959, 'Minimalist Trance', 200005, '200'),
(2000960, 'Minneapolis Sound', 200015, '200'),
(2000961, 'Minstrel Show', 200006, '200'),
(2000962, 'Minuet', 200002, '200'),
(2000963, 'Mirolóyia', 200016, '200'),
(2000964, 'Modal Jazz', 200008, '200'),
(2000965, 'Modern Classical', 200011, '200'),
(2000966, 'Modern Laika', 200006, '200'),
(2000967, 'Modern Rock', 200015, '200'),
(2000968, 'Modinha', 200009, '200'),
(2000969, 'Mohabelo', 200016, '200'),
(2000970, 'Montuno', 200009, '200'),
(2000971, 'Monumental Dance', 200005, '200'),
(2000972, 'Mor Lam', 200006, '200'),
(2000973, 'Mor Lam Sing', 200006, '200'),
(2000974, 'Morna', 200016, '200'),
(2000975, 'Motorpop', 200012, '200'),
(2000976, 'Motown', 200014, '200'),
(2000977, 'Mozambique', 200016, '200'),
(2000978, 'MPB', 200009, '200'),
(2000979, 'Mugam', 200006, '200'),
(2000980, 'Multicultural', 200016, '200'),
(2000981, 'Mumble Rap', 200007, '200'),
(2000982, 'Murga', 200009, '200'),
(2000983, 'Museve', 200016, '200'),
(2000984, 'Mushroom Jazz Drama Hall', 200008, '200'),
(2000985, 'Musiqi-E Assil', 200006, '200'),
(2000986, 'Musique Concrète', 200004, '200'),
(2000987, 'Mutuashi', 200016, '200'),
(2000988, 'Muwashshah', 200016, '200'),
(2000989, 'Muzak', 200016, '200'),
(2000990, 'Méringue', 200009, '200'),
(2000991, 'Música Campesina', 200009, '200'),
(2000992, 'Música Criolla', 200009, '200'),
(2000993, 'Música del Interior', 200009, '200'),
(2000994, 'Música Llanera', 200009, '200'),
(2000995, 'Música Nordestina', 200009, '200'),
(2000996, 'Música Popular Brasileira', 200009, '200'),
(2000997, 'Música Tropical', 200009, '200'),
(2000998, 'Nagauta', 200006, '200'),
(2000999, 'Nakasi', 200006, '200'),
(2001000, 'Nangma', 200006, '200'),
(2001001, 'Nanguan', 200006, '200'),
(2001002, 'Narcocorrido', 200009, '200'),
(2001003, 'Nardcore', 200015, '200'),
(2001004, 'Narodna', 200016, '200'),
(2001005, 'Nasheed', 200016, '200'),
(2001006, 'Nashville Sound', 200003, '200'),
(2001007, 'Neoclassical New-Age', 200011, '200'),
(2001008, 'National Socialist Black Metal', 200010, '200'),
(2001009, 'Naturalismo', 200006, '200'),
(2001010, 'Nederpop', 200012, '200'),
(2001011, 'Neo Soul', 200014, '200'),
(2001012, 'Neo-Classical Dark Wave', 200005, '200'),
(2001013, 'Neo-Classical Metal', 200010, '200'),
(2001014, 'Neo-Medieval', 200006, '200'),
(2001015, 'Neo-Progressive Rock', 200015, '200'),
(2001016, 'Neo-Psychedelia', 200015, '200'),
(2001017, 'Neoclassical', 200011, '200'),
(2001018, 'Neofolk', 200006, '200'),
(2001019, 'Neotraditional Country', 200003, '200'),
(2001020, 'Nerdcore', 200007, '200'),
(2001021, 'Neue Deutsche Härte', 200010, '200'),
(2001022, 'Neue Deutsche Todeskunst', 200015, '200'),
(2001023, 'Neue Deutsche Welle', 200015, '200'),
(2001024, 'New Age', 200011, '200'),
(2001025, 'New Beat', 200005, '200'),
(2001026, 'New Instrumental', 200011, '200'),
(2001027, 'New Jack Swing', 200014, '200'),
(2001028, 'New Orleans Blues', 200001, '200'),
(2001029, 'New Orleans Jazz', 200008, '200'),
(2001030, 'New Pop', 200012, '200'),
(2001031, 'New Prog', 200015, '200'),
(2001032, 'New Rave', 200015, '200'),
(2001033, 'New Romantic', 200015, '200'),
(2001034, 'New School Hip Hop', 200007, '200'),
(2001035, 'New Taiwanese Song', 200006, '200'),
(2001036, 'New Wave', 200015, '200'),
(2001037, 'New Wave of British Heavy Metal', 200010, '200'),
(2001038, 'New Wave of New Wave', 200015, '200'),
(2001039, 'New Weird America', 200015, '200'),
(2001040, 'New York Blues', 200001, '200'),
(2001041, 'New York House', 200005, '200'),
(2001042, 'Newgrass', 200003, '200'),
(2001043, 'Nganja', 200016, '200'),
(2001044, 'Niche', 200005, '200'),
(2001045, 'Nightcore', 200005, '200'),
(2001046, 'Nintendocore', 200005, '200'),
(2001047, 'Nisiótika', 200016, '200'),
(2001048, 'No Wave', 200015, '200'),
(2001049, 'Noh', 200016, '200'),
(2001050, 'Noise Pop', 200012, '200'),
(2001051, 'Noise Rock', 200015, '200'),
(2001052, 'Nongak', 200016, '200'),
(2001053, 'Norae Undong', 200016, '200'),
(2001054, 'Nordic Folk', 200006, '200'),
(2001055, 'Nordic Folk Dance', 200006, '200'),
(2001056, 'Nortec', 200009, '200'),
(2001057, 'Norteño', 200009, '200'),
(2001058, 'Northern Soul', 200014, '200'),
(2001059, 'Nota', 200006, '200'),
(2001060, 'Nu Breaks', 200005, '200'),
(2001061, 'Nu Disco', 200005, '200'),
(2001062, 'Nu Gaze', 200015, '200'),
(2001063, 'Nu Jazz', 200008, '200'),
(2001064, 'Nu Metal', 200010, '200'),
(2001065, 'Nu Soul', 200014, '200'),
(2001066, 'Nueva Canción', 200009, '200'),
(2001067, 'Nyatiti', 200016, '200'),
(2001068, 'Néo Kýma', 200016, '200'),
(2001069, 'Obscuro', 200006, '200'),
(2001070, 'Oi!', 200015, '200'),
(2001071, 'Old School Hip Hop', 200007, '200'),
(2001072, 'Old-Time', 200006, '200'),
(2001073, 'Olonkho', 200006, '200'),
(2001074, 'Oltului', 200006, '200'),
(2001075, 'Ondo', 200006, '200'),
(2001076, 'Opera', 200002, '200'),
(2001077, 'Operatic Pop', 200012, '200'),
(2001078, 'Oratorio', 200002, '200'),
(2001079, 'Orchestra', 200002, '200'),
(2001080, 'Organ Trio', 200008, '200'),
(2001081, 'Organic Ambient', 200011, '200'),
(2001082, 'Organum', 200002, '200'),
(2001083, 'Orgel', 200006, '200'),
(2001084, 'Oriental Metal', 200010, '200'),
(2001085, 'Ottava Rima', 200006, '200'),
(2001086, 'Outlaw Country', 200003, '200'),
(2001087, 'Outsider', 200006, '200'),
(2001088, 'P-Funk', 200015, '200'),
(2001089, 'Pagan Metal', 200010, '200'),
(2001090, 'Pagan Rock', 200015, '200'),
(2001091, 'Pagode', 200009, '200'),
(2001092, 'Paisley Underground', 200015, '200'),
(2001093, 'Palm Wine', 200009, '200'),
(2001094, 'Pambiche', 200009, '200'),
(2001095, 'Panambih', 200006, '200'),
(2001096, 'Panche Baja', 200016, '200'),
(2001097, 'Panchavadyam', 200016, '200'),
(2001098, 'Pansori', 200006, '200'),
(2001099, 'Paranda', 200016, '200'),
(2001100, 'Parang', 200009, '200'),
(2001101, 'Parody', 200006, '200'),
(2001102, 'Parranda', 200009, '200'),
(2001103, 'Partido Alto', 200009, '200'),
(2001104, 'Pasillo', 200009, '200'),
(2001105, 'Patriotic', 200006, '200'),
(2001106, 'Peace Punk', 200015, '200'),
(2001107, 'Pelimanni', 200006, '200'),
(2001108, 'Petenera', 200016, '200'),
(2001109, 'Peyote Song', 200006, '200'),
(2001110, 'Philadelphia Soul', 200014, '200'),
(2001111, 'Piano Blues', 200001, '200'),
(2001112, 'Piano Rock', 200015, '200'),
(2001113, 'Piedmont Blues', 200001, '200'),
(2001114, 'Pimba', 200016, '200'),
(2001115, 'Pinoy Pop', 200012, '200'),
(2001116, 'Pinoy Rock', 200015, '200'),
(2001117, 'Pinpeat Orchestra', 200016, '200'),
(2001118, 'Piphat', 200006, '200'),
(2001119, 'Pirate Metal', 200010, '200'),
(2001120, 'Plainsong', 200002, '200'),
(2001121, 'Plena', 200009, '200'),
(2001122, 'Pleng Phua Cheewit', 200016, '200'),
(2001123, 'Pleng Thai Sakorn', 200016, '200'),
(2001124, 'Political Hip Hop', 200007, '200'),
(2001125, 'Polka', 200016, '200'),
(2001126, 'Polo', 200009, '200'),
(2001127, 'Polonaise', 200016, '200'),
(2001128, 'Pols', 200016, '200'),
(2001129, 'Polska', 200016, '200'),
(2001130, 'Pong Lang', 200016, '200'),
(2001131, 'Pop', 200012, '200'),
(2001132, 'Pop Folk', 200006, '200'),
(2001133, 'Pop Funk', 200015, '200'),
(2001134, 'Pop Metal', 200010, '200'),
(2001135, 'Pop Punk', 200015, '200'),
(2001136, 'Pop Rap', 200007, '200'),
(2001137, 'Pop Rock', 200015, '200'),
(2001138, 'Popular', 200006, '200'),
(2001139, 'Pornocore', 200007, '200'),
(2001140, 'Porro', 200009, '200'),
(2001141, 'Post-Country', 200003, '200'),
(2001142, 'Post-Britpop', 200012, '200'),
(2001143, 'Post-Disco', 200005, '200'),
(2001144, 'Post-Grunge', 200015, '200'),
(2001145, 'Post-Hardcore', 200015, '200'),
(2001146, 'Post-Industrial', 200005, '200'),
(2001147, 'Post-Metal', 200010, '200'),
(2001148, 'Post-Minimalism', 200005, '200'),
(2001149, 'Post-Punk', 200015, '200'),
(2001150, 'Post-Punk Revival', 200015, '200'),
(2001151, 'Post-Rock', 200015, '200'),
(2001152, 'Post-Romanticism', 200006, '200'),
(2001153, 'Pow-Wow', 200016, '200'),
(2001154, 'Power Electronics', 200005, '200'),
(2001155, 'Power Metal', 200010, '200'),
(2001156, 'Power Noise', 200005, '200'),
(2001157, 'Power Pop', 200012, '200'),
(2001158, 'Powerviolence', 200015, '200'),
(2001159, 'Ppongtchak', 200016, '200'),
(2001160, 'Praise Song', 200006, '200'),
(2001161, 'Program Symphony', 200002, '200'),
(2001162, 'Progressive Bluegrass', 200003, '200'),
(2001163, 'Progressive Country', 200003, '200'),
(2001164, 'Progressive Death Metal', 200010, '200'),
(2001165, 'Progressive Electronic', 200011, '200'),
(2001166, 'Progressive Folk', 200006, '200'),
(2001167, 'Progressive Funk', 200014, '200'),
(2001168, 'Progressive House', 200005, '200'),
(2001169, 'Progressive Metal', 200010, '200'),
(2001170, 'Progressive Rock', 200015, '200'),
(2001171, 'Progressive Trance', 200005, '200'),
(2001172, 'Protopunk', 200015, '200'),
(2001173, 'Psych Folk', 200006, '200'),
(2001174, 'Psychedelic', 200006, '200'),
(2001175, 'Psychedelic Hip Hop', 200007, '200'),
(2001176, 'Psychedelic Pop', 200012, '200'),
(2001177, 'Psychedelic Rock', 200015, '200'),
(2001178, 'Psychedelic Trance', 200005, '200'),
(2001179, 'Psychobilly', 200015, '200'),
(2001180, 'Punk Blues', 200001, '200'),
(2001181, 'Punk Cabaret', 200015, '200'),
(2001182, 'Punk Jazz', 200008, '200'),
(2001183, 'Punk Rock', 200015, '200'),
(2001184, 'Punta', 200009, '200'),
(2001185, 'Punta Rock', 200015, '200'),
(2001186, 'Qasidah', 200016, '200'),
(2001187, 'Qasidah Modern', 200016, '200'),
(2001188, 'Qawwali', 200016, '200'),
(2001189, 'Quadrille', 200006, '200'),
(2001190, 'Quan Ho', 200016, '200'),
(2001191, 'Queercore', 200015, '200'),
(2001192, 'Quiet Storm', 200014, '200'),
(2001193, 'Rada', 200016, '200'),
(2001194, 'Raga', 200016, '200'),
(2001195, 'Raga Rock', 200015, '200'),
(2001196, 'Ragga', 200013, '200'),
(2001197, 'Ragga Jungle', 200005, '200'),
(2001198, 'Raggamuffin', 200013, '200'),
(2001199, 'Ragtime', 200006, '200'),
(2001200, 'Rai', 200006, '200'),
(2001201, 'Rake-and-Scrape', 200007, '200'),
(2001202, 'Ramkbach', 200016, '200'),
(2001203, 'Ramvong', 200016, '200'),
(2001204, 'Ranchera', 200009, '200'),
(2001205, 'Rap', 200007, '200'),
(2001206, 'Rap Metal', 200010, '200'),
(2001207, 'Rap Rock', 200015, '200'),
(2001208, 'Rapcore', 200007, '200'),
(2001209, 'Rara', 200009, '200'),
(2001210, 'Rare Groove', 200008, '200'),
(2001211, 'Rasiya', 200006, '200'),
(2001212, 'Rave', 200005, '200'),
(2001213, 'Raw Rock', 200015, '200'),
(2001214, 'Raï', 200016, '200'),
(2001215, 'Rebetiko', 200006, '200'),
(2001216, 'Red Dirt', 200003, '200'),
(2001217, 'Reel', 200004, '200'),
(2001218, 'Reggae', 200013, '200'),
(2001219, 'Reggae Fusion', 200013, '200'),
(2001220, 'Reggae Highlife', 200013, '200'),
(2001221, 'Reggaeton', 200009, '200'),
(2001222, 'Rekilaulu', 200006, '200'),
(2001223, 'Relaxative', 200011, '200'),
(2001224, 'Religious', 200006, '200'),
(2001225, 'Rembetiko', 200016, '200'),
(2001226, 'Renaissance', 200002, '200'),
(2001227, 'Requiem', 200002, '200'),
(2001228, 'Rhapsody', 200002, '200'),
(2001229, 'Rhyming Spiritual', 200006, '200'),
(2001230, 'Rhythm & Blues', 200014, '200'),
(2001231, 'Ricercar', 200002, '200'),
(2001232, 'Riot Grrrl', 200015, '200'),
(2001233, 'Rock', 200015, '200'),
(2001234, 'Rock and Roll', 200015, '200'),
(2001235, 'Rock en Español', 200015, '200'),
(2001236, 'Rock Opera', 200015, '200'),
(2001237, 'Rockabilly', 200015, '200'),
(2001238, 'Rocksteady', 200013, '200'),
(2001239, 'Romantic', 200002, '200'),
(2001240, 'Rondeaux', 200006, '200'),
(2001241, 'Ronggeng', 200016, '200'),
(2001242, 'Roots Reggae', 200013, '200'),
(2001243, 'Roots Rock', 200015, '200'),
(2001244, 'Roots Rock Reggae', 200013, '200'),
(2001245, 'Rumba', 200009, '200'),
(2001246, 'Russian Pop', 200012, '200'),
(2001247, 'Rímur', 200006, '200'),
(2001248, 'Sabar', 200016, '200'),
(2001249, 'Sacred Harp', 200002, '200'),
(2001250, 'Sadcore', 200015, '200'),
(2001251, 'Saibara', 200016, '200'),
(2001252, 'Sakara', 200016, '200'),
(2001253, 'Salegy', 200016, '200'),
(2001254, 'Salsa', 200009, '200'),
(2001255, 'Salsa Choke', 200009, '200'),
(2001256, 'Salsa Erotica', 200009, '200'),
(2001257, 'Salsa Romántica', 200009, '200'),
(2001258, 'Saltarello', 200002, '200'),
(2001259, 'Samba', 200009, '200'),
(2001260, 'Samba-Canção', 200009, '200'),
(2001261, 'Samba-Reggae, ', 200013, '200'),
(2001262, 'Samba-Rock', 200015, '200'),
(2001263, 'Sambai', 200006, '200'),
(2001264, 'Sanjo', 200016, '200'),
(2001265, 'Sarabande', 200002, '200'),
(2001266, 'Sawt', 200016, '200'),
(2001267, 'Saya', 200006, '200'),
(2001268, 'Scat', 200008, '200'),
(2001269, 'Schlager', 200012, '200'),
(2001270, 'Schottisch', 200006, '200'),
(2001271, 'Schranz', 200006, '200'),
(2001272, 'Scottish Baroque', 200006, '200'),
(2001273, 'Screamo', 200015, '200'),
(2001274, 'Scrumpy and Western', 200006, '200'),
(2001275, 'Sea Shanty', 200006, '200'),
(2001276, 'Sean Nós', 200006, '200'),
(2001277, 'Second Viennese School', 200016, '200'),
(2001278, 'Sega', 200006, '200'),
(2001279, 'Seggae', 200006, '200'),
(2001280, 'Seis', 200009, '200'),
(2001281, 'Semba', 200016, '200'),
(2001282, 'Sephardic', 200006, '200'),
(2001283, 'Serialism', 200002, '200'),
(2001284, 'Set Dance', 200006, '200'),
(2001285, 'Sevdalinka', 200006, '200'),
(2001286, 'Sevillana', 200006, '200'),
(2001287, 'Shabab', 200016, '200'),
(2001288, 'Shabad', 200006, '200'),
(2001289, 'Shalako', 200006, '200'),
(2001290, 'Shan\'ge', 200006, '200'),
(2001291, 'Shango', 200016, '200'),
(2001292, 'Shape Note', 200002, '200'),
(2001293, 'Shibuya-Kei', 200012, '200'),
(2001294, 'Shidaiqu', 200006, '200'),
(2001295, 'Shima Uta', 200006, '200'),
(2001296, 'Shock Rock', 200015, '200'),
(2001297, 'Shoegaze', 200015, '200'),
(2001298, 'Shoka', 200006, '200'),
(2001299, 'Shomyo', 200006, '200'),
(2001300, 'Show Tune', 200004, '200'),
(2001301, 'Sica', 200006, '200'),
(2001302, 'Siguiriyas', 200006, '200'),
(2001303, 'Silat', 200006, '200'),
(2001304, 'Sinawi', 200016, '200'),
(2001305, 'Singer-Songwriter', 200012, '200'),
(2001306, 'Situational', 200011, '200'),
(2001307, 'Ska', 200013, '200'),
(2001308, 'Ska Punk', 200015, '200'),
(2001309, 'Skacore', 200013, '200'),
(2001310, 'Skald', 200013, '200'),
(2001311, 'Skate Punk', 200015, '200'),
(2001312, 'Skiffle', 200001, '200'),
(2001313, 'Slack-Key Guitar', 200006, '200'),
(2001314, 'Slide', 200006, '200'),
(2001315, 'Slowcore', 200015, '200'),
(2001316, 'Sludge Metal', 200010, '200'),
(2001317, 'Slängpolska', 200006, '200'),
(2001318, 'Smooth Jazz', 200008, '200'),
(2001319, 'Smooth Soul', 200014, '200');
INSERT INTO `subgenres` (`sgnID`, `sgnName`, `sgnGenreID`, `sgnMediaTypeID`) VALUES
(2001320, 'Soca', 200016, '200'),
(2001321, 'Soft Rock', 200015, '200'),
(2001322, 'Son Cubano', 200009, '200'),
(2001323, 'Son Montuno', 200009, '200'),
(2001324, 'Son-Batá', 200006, '200'),
(2001325, 'Sonata', 200002, '200'),
(2001326, 'Songo', 200009, '200'),
(2001327, 'Songo-Salsa', 200009, '200'),
(2001328, 'Sophisti-Pop', 200012, '200'),
(2001329, 'Soukous', 200016, '200'),
(2001330, 'Soul', 200014, '200'),
(2001331, 'Soul Blues', 200001, '200'),
(2001332, 'Soul Jazz', 200008, '200'),
(2001333, 'Soul Pop', 200012, '200'),
(2001334, 'Soundtrack', 200006, '200'),
(2001335, 'Southern Gospel', 200006, '200'),
(2001336, 'Southern Harmony', 200006, '200'),
(2001337, 'Southern Hip Hop', 200007, '200'),
(2001338, 'Southern Metal', 200010, '200'),
(2001339, 'Southern Rock', 200015, '200'),
(2001340, 'Southern Soul', 200014, '200'),
(2001341, 'Space Age Pop', 200012, '200'),
(2001342, 'Space', 200011, '200'),
(2001343, 'Space Disco', 200005, '200'),
(2001344, 'Space Rock', 200015, '200'),
(2001345, 'Spectralism', 200011, '200'),
(2001346, 'Speed Garage', 200015, '200'),
(2001347, 'Speed Metal', 200010, '200'),
(2001348, 'Speedcore', 200005, '200'),
(2001349, 'Spiritual', 200002, '200'),
(2001350, 'Spoken Word', 200004, '200'),
(2001351, 'Spouge', 200016, '200'),
(2001352, 'Sprechgesang', 200016, '200'),
(2001353, 'Square Dance', 200005, '200'),
(2001354, 'Squee', 200016, '200'),
(2001355, 'St. Louis Blues', 200001, '200'),
(2001356, 'Steelband', 200006, '200'),
(2001357, 'Stoner Metal', 200010, '200'),
(2001358, 'Stoner Rock', 200015, '200'),
(2001359, 'Straight Edge', 200015, '200'),
(2001360, 'Strathspey', 200006, '200'),
(2001361, 'Stride', 200008, '200'),
(2001362, 'String', 200002, '200'),
(2001363, 'String Quartet', 200002, '200'),
(2001364, 'Sufi', 200006, '200'),
(2001365, 'Suite', 200008, '200'),
(2001366, 'Sunshine Pop', 200012, '200'),
(2001367, 'Suomirock', 200015, '200'),
(2001368, 'Super Eurobeat', 200005, '200'),
(2001369, 'Surf', 200012, '200'),
(2001370, 'Surf Ballad', 200012, '200'),
(2001371, 'Surf Instrumental', 200012, '200'),
(2001372, 'Surf Pop', 200012, '200'),
(2001373, 'Surf Rock', 200015, '200'),
(2001374, 'Swamp Blues', 200001, '200'),
(2001375, 'Swamp Pop', 200012, '200'),
(2001376, 'Swamp Rock', 200015, '200'),
(2001377, 'Swing', 200008, '200'),
(2001378, 'Swingbeat', 200014, '200'),
(2001379, 'Sygyt', 200006, '200'),
(2001380, 'Symphonic Black Metal', 200010, '200'),
(2001381, 'Symphonic Metal', 200010, '200'),
(2001382, 'Symphonic Poem', 200006, '200'),
(2001383, 'Symphonic Rock', 200015, '200'),
(2001384, 'Symphony', 200002, '200'),
(2001385, 'Synth-Pop', 200005, '200'),
(2001386, 'Synth-Punk', 200005, '200'),
(2001387, 'Synth-Rock', 200005, '200'),
(2001388, 'T\'ong Guitar', 200006, '200'),
(2001389, 'Taarab', 200016, '200'),
(2001390, 'Tai Tu', 200016, '200'),
(2001391, 'Taiwanese Pop', 200012, '200'),
(2001392, 'Tala', 200016, '200'),
(2001393, 'Talempong', 200016, '200'),
(2001394, 'Tambu', 200016, '200'),
(2001395, 'Tamburitza', 200016, '200'),
(2001396, 'Tamil Christian Keerthanai', 200006, '200'),
(2001397, 'Tango', 200009, '200'),
(2001398, 'Tanguk', 200006, '200'),
(2001399, 'Tappa', 200016, '200'),
(2001400, 'Tarana', 200016, '200'),
(2001401, 'Tarantella', 200016, '200'),
(2001402, 'Taranto', 200016, '200'),
(2001403, 'Tech', 200005, '200'),
(2001404, 'Tech House', 200005, '200'),
(2001405, 'Tech Trance', 200005, '200'),
(2001406, 'Technical Death Metal', 200010, '200'),
(2001407, 'Technical Metal', 200010, '200'),
(2001408, 'Techno', 200005, '200'),
(2001409, 'Technoid', 200005, '200'),
(2001410, 'Technopop', 200012, '200'),
(2001411, 'Techstep', 200005, '200'),
(2001412, 'Techtonik', 200005, '200'),
(2001413, 'Teen Pop', 200012, '200'),
(2001414, 'Tejano', 200006, '200'),
(2001415, 'Tekno', 200005, '200'),
(2001416, 'Tembang Sunda', 200016, '200'),
(2001417, 'Texas Blues', 200001, '200'),
(2001418, 'Thai Pop', 200012, '200'),
(2001419, 'Thillana', 200016, '200'),
(2001420, 'Thrash Metal', 200010, '200'),
(2001421, 'Thrashcore', 200015, '200'),
(2001422, 'Thumri', 200006, '200'),
(2001423, 'Tibetan Pop', 200012, '200'),
(2001424, 'Tiento', 200016, '200'),
(2001425, 'Timbila', 200016, '200'),
(2001426, 'Tin Pan Alley', 200006, '200'),
(2001427, 'Tinga', 200016, '200'),
(2001428, 'Tinku', 200009, '200'),
(2001429, 'Toeshey', 200016, '200'),
(2001430, 'Togaku', 200016, '200'),
(2001431, 'Traditional Jazz', 200008, '200'),
(2001432, 'Traditional Bluegrass', 200003, '200'),
(2001433, 'Traditional Pop', 200012, '200'),
(2001434, 'Trallalero', 200006, '200'),
(2001435, 'Trance', 200005, '200'),
(2001436, 'Trap', 200007, '200'),
(2001437, 'Tribal House', 200005, '200'),
(2001438, 'Trip Hop', 200007, '200'),
(2001439, 'Trip Rock', 200015, '200'),
(2001440, 'Trip-Hop', 200007, '200'),
(2001441, 'Tropical', 200009, '200'),
(2001442, 'Tropicalia', 200009, '200'),
(2001443, 'Tropicalismo', 200009, '200'),
(2001444, 'Tropipop', 200012, '200'),
(2001445, 'Truck-Driving Country', 200003, '200'),
(2001446, 'Tumba', 200009, '200'),
(2001447, 'Turbo-Folk', 200006, '200'),
(2001448, 'Turkish', 200006, '200'),
(2001449, 'Turkish Pop', 200012, '200'),
(2001450, 'Turntablism', 200005, '200'),
(2001451, 'Tuvan Throat-Singing', 200006, '200'),
(2001452, 'Twee Pop', 200012, '200'),
(2001453, 'Twist', 200015, '200'),
(2001454, 'Two Tone', 200013, '200'),
(2001455, 'Táncház', 200006, '200'),
(2001456, 'UK Garage', 200015, '200'),
(2001457, 'UK Pub Rock', 200015, '200'),
(2001458, 'Unblack Metal', 200010, '200'),
(2001459, 'Underground', 200015, '200'),
(2001460, 'Uplifting', 200005, '200'),
(2001461, 'Uplifting Trance', 200005, '200'),
(2001462, 'Urban Cowboy', 200006, '200'),
(2001463, 'Urban Folk', 200006, '200'),
(2001464, 'Urban Jazz', 200008, '200'),
(2001465, 'Vallenato Tradicional', 200009, '200'),
(2001466, 'Vallenato Moderno', 200009, '200'),
(2001467, 'Vaudeville', 200006, '200'),
(2001468, 'Verbunkos', 200016, '200'),
(2001469, 'Verismo', 200006, '200'),
(2001470, 'Video Game', 200005, '200'),
(2001471, 'Viking Metal', 200010, '200'),
(2001472, 'Villanella', 200002, '200'),
(2001473, 'Virelai', 200006, '200'),
(2001474, 'Vispop', 200012, '200'),
(2001475, 'Visual Kei', 200015, '200'),
(2001476, 'Vocal', 200004, '200'),
(2001477, 'Vocal House', 200005, '200'),
(2001478, 'Vocal Jazz', 200008, '200'),
(2001479, 'Volksmusic', 200006, '200'),
(2001480, 'Waila', 200006, '200'),
(2001481, 'Waltz', 200002, '200'),
(2001482, 'Wangga', 200016, '200'),
(2001483, 'Warabe Uta', 200016, '200'),
(2001484, 'Wassoulou', 200006, '200'),
(2001485, 'Weld', 200016, '200'),
(2001486, 'Were', 200016, '200'),
(2001487, 'West Coast Hip Hop', 200007, '200'),
(2001488, 'West Coast Jazz', 200008, '200'),
(2001489, 'Western', 200003, '200'),
(2001490, 'Western Blues', 200001, '200'),
(2001491, 'Western Swing', 200003, '200'),
(2001492, 'Witch House', 200005, '200'),
(2001493, 'Wizard Rock', 200015, '200'),
(2001494, 'Wong Shadow', 200016, '200'),
(2001495, 'Wonky Pop', 200012, '200'),
(2001496, 'Wood', 200016, '200'),
(2001497, 'Work Song', 200006, '200'),
(2001498, 'World', 200016, '200'),
(2001499, 'World Fusion', 200005, '200'),
(2001500, 'Worldbeat', 200005, '200'),
(2001501, 'Xhosa', 200016, '200'),
(2001502, 'Xoomii', 200016, '200'),
(2001503, 'Yatch Rock', 200015, '200'),
(2001504, 'Yayue', 200006, '200'),
(2001505, 'Yo-Pop', 200012, '200'),
(2001506, 'Yodeling', 200006, '200'),
(2001507, 'Yukar', 200006, '200'),
(2001508, 'Yé-Yé', 200012, '200'),
(2001509, 'Zajal', 200006, '200'),
(2001510, 'Zamrock', 200015, '200'),
(2001511, 'Zarzuela', 200016, '200'),
(2001512, 'Zeibekiko', 200016, '200'),
(2001513, 'Zeuhl', 200016, '200'),
(2001514, 'Ziglibithy', 200016, '200'),
(2001515, 'Zouglou', 200016, '200'),
(2001516, 'Zouk', 200006, '200'),
(2001517, 'Zouk Chouv', 200006, '200'),
(2001518, 'Zouklove', 200006, '200'),
(2001519, 'Zulu', 200016, '200'),
(2001520, 'Zydeco', 200001, '200');

-- --------------------------------------------------------

--
-- Table structure for table `subseries`
--

CREATE TABLE `subseries` (
  `ssrID` int(11) NOT NULL,
  `ssrSerieID` int(11) DEFAULT NULL,
  `ssrName` text DEFAULT NULL,
  `ssrOtherNames` text DEFAULT NULL,
  `ssrWriterID` text DEFAULT NULL,
  `ssrDirector` text DEFAULT NULL,
  `ssrStudioID` int(11) DEFAULT NULL,
  `ssrSubGenreID` text DEFAULT NULL,
  `ssrSourceMaterialID` text DEFAULT NULL,
  `ssrContinuityID` int(11) DEFAULT NULL,
  `ssrCoverID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `system`
--

CREATE TABLE `system` (
  `sysID` int(11) NOT NULL COMMENT 'System setting ID',
  `sysDevice` varchar(100) DEFAULT NULL COMMENT 'Device ID',
  `sysLoginDate` varchar(50) DEFAULT NULL COMMENT 'Login date',
  `sysDarkMode` int(11) DEFAULT NULL COMMENT 'Dark Mode Setup'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `system`
--

INSERT INTO `system` (`sysID`, `sysDevice`, `sysLoginDate`, `sysDarkMode`) VALUES
(7, 'NJX3S24H1RTXH2JV9KGJ2ERX9BHQQWGGDMN1G9T64FBXP4MYMP0G', '11/19/2021 11:11:23 AM', 1);

-- --------------------------------------------------------

--
-- Table structure for table `tracks`
--

CREATE TABLE `tracks` (
  `traID` int(11) NOT NULL,
  `traName` text DEFAULT NULL,
  `traAltName` text DEFAULT NULL,
  `traTrackType` text DEFAULT NULL,
  `traDuration` text DEFAULT NULL,
  `traAuthorID` text DEFAULT NULL,
  `traBandID` text DEFAULT NULL,
  `traBPM` text DEFAULT NULL,
  `traVideo` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `tracktypes`
--

CREATE TABLE `tracktypes` (
  `ttyID` int(11) NOT NULL,
  `ttyName` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `user`
--

CREATE TABLE `user` (
  `usrID` int(11) NOT NULL COMMENT 'ID',
  `usrMachineID` varchar(50) DEFAULT NULL COMMENT 'Machine ID',
  `usrName` text DEFAULT NULL COMMENT 'Username',
  `usrBirthDate` text DEFAULT NULL COMMENT 'Birth Date',
  `usrPassword` text DEFAULT NULL COMMENT 'Password',
  `usrMail` text DEFAULT NULL COMMENT 'Email',
  `usrFirstName` text DEFAULT NULL COMMENT 'First Name',
  `usrMiddleName` text DEFAULT NULL COMMENT 'Middle Name',
  `usrLastName` text DEFAULT NULL COMMENT 'Last Name',
  `usrImage` text DEFAULT NULL COMMENT 'Image',
  `usrGenderID` text DEFAULT NULL COMMENT 'Gender ID',
  `usrRegistrationDate` text DEFAULT NULL COMMENT 'Registration Date',
  `usrLastLoginDate` text DEFAULT NULL COMMENT 'Last Logon Date',
  `usrRoleID` int(11) DEFAULT NULL COMMENT 'Role ID'
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `user`
--

INSERT INTO `user` (`usrID`, `usrMachineID`, `usrName`, `usrBirthDate`, `usrPassword`, `usrMail`, `usrFirstName`, `usrMiddleName`, `usrLastName`, `usrImage`, `usrGenderID`, `usrRegistrationDate`, `usrLastLoginDate`, `usrRoleID`) VALUES
(0, '7', 'ereyes', '07/17/1995', 'MTIz', 'ereyesc95@gmail.com', 'Eduardo', NULL, 'Reyes', NULL, '0', '11/19/2021 4:24:37 PM', '11/20/2021 2:11:42 PM', 0);

-- --------------------------------------------------------

--
-- Table structure for table `userroles`
--

CREATE TABLE `userroles` (
  `uroID` int(11) NOT NULL,
  `uroName` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Dumping data for table `userroles`
--

INSERT INTO `userroles` (`uroID`, `uroName`) VALUES
(0, 'Admin'),
(1, 'Super-user'),
(2, 'User');

-- --------------------------------------------------------

--
-- Table structure for table `usersettings`
--

CREATE TABLE `usersettings` (
  `setID` int(11) NOT NULL,
  `setUserID` int(11) DEFAULT NULL,
  `setFavorites` text DEFAULT NULL,
  `setBlackList` text DEFAULT NULL,
  `setDefault` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `websites`
--

CREATE TABLE `websites` (
  `webID` int(11) NOT NULL,
  `webName` text DEFAULT NULL,
  `webLogoID` text DEFAULT NULL,
  `webURL` text DEFAULT NULL,
  `webTypeID` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- --------------------------------------------------------

--
-- Table structure for table `websitetypes`
--

CREATE TABLE `websitetypes` (
  `wstID` int(11) NOT NULL,
  `wstName` varchar(45) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `artistparticipations`
--
ALTER TABLE `artistparticipations`
  ADD PRIMARY KEY (`arpID`);

--
-- Indexes for table `artists`
--
ALTER TABLE `artists`
  ADD PRIMARY KEY (`artID`);

--
-- Indexes for table `bands`
--
ALTER TABLE `bands`
  ADD PRIMARY KEY (`bndID`);

--
-- Indexes for table `books`
--
ALTER TABLE `books`
  ADD PRIMARY KEY (`booID`);

--
-- Indexes for table `bookseries`
--
ALTER TABLE `bookseries`
  ADD PRIMARY KEY (`bosID`);

--
-- Indexes for table `characters`
--
ALTER TABLE `characters`
  ADD PRIMARY KEY (`chrID`);

--
-- Indexes for table `companies`
--
ALTER TABLE `companies`
  ADD PRIMARY KEY (`comID`);

--
-- Indexes for table `companytypes`
--
ALTER TABLE `companytypes`
  ADD PRIMARY KEY (`ctyID`);

--
-- Indexes for table `contenttype`
--
ALTER TABLE `contenttype`
  ADD PRIMARY KEY (`cntID`);

--
-- Indexes for table `continents`
--
ALTER TABLE `continents`
  ADD PRIMARY KEY (`conID`);

--
-- Indexes for table `continuities`
--
ALTER TABLE `continuities`
  ADD PRIMARY KEY (`ctnID`);

--
-- Indexes for table `countries`
--
ALTER TABLE `countries`
  ADD PRIMARY KEY (`couID`);

--
-- Indexes for table `editions`
--
ALTER TABLE `editions`
  ADD PRIMARY KEY (`ediID`);

--
-- Indexes for table `episodes`
--
ALTER TABLE `episodes`
  ADD PRIMARY KEY (`epiID`);

--
-- Indexes for table `episodetypes`
--
ALTER TABLE `episodetypes`
  ADD PRIMARY KEY (`eptID`);

--
-- Indexes for table `genders`
--
ALTER TABLE `genders`
  ADD PRIMARY KEY (`gndID`);

--
-- Indexes for table `genres`
--
ALTER TABLE `genres`
  ADD PRIMARY KEY (`genID`);

--
-- Indexes for table `images`
--
ALTER TABLE `images`
  ADD PRIMARY KEY (`imaID`);

--
-- Indexes for table `imagetypes`
--
ALTER TABLE `imagetypes`
  ADD PRIMARY KEY (`imtID`);

--
-- Indexes for table `instruments`
--
ALTER TABLE `instruments`
  ADD PRIMARY KEY (`insID`);

--
-- Indexes for table `instrumenttypes`
--
ALTER TABLE `instrumenttypes`
  ADD PRIMARY KEY (`intID`);

--
-- Indexes for table `languages`
--
ALTER TABLE `languages`
  ADD PRIMARY KEY (`lanID`);

--
-- Indexes for table `movies`
--
ALTER TABLE `movies`
  ADD PRIMARY KEY (`movID`);

--
-- Indexes for table `movieseries`
--
ALTER TABLE `movieseries`
  ADD PRIMARY KEY (`mosID`);

--
-- Indexes for table `occupations`
--
ALTER TABLE `occupations`
  ADD PRIMARY KEY (`occID`);

--
-- Indexes for table `participationtypes`
--
ALTER TABLE `participationtypes`
  ADD PRIMARY KEY (`parID`);

--
-- Indexes for table `performances`
--
ALTER TABLE `performances`
  ADD PRIMARY KEY (`prfID`);

--
-- Indexes for table `releases`
--
ALTER TABLE `releases`
  ADD PRIMARY KEY (`relID`);

--
-- Indexes for table `releasetracklists`
--
ALTER TABLE `releasetracklists`
  ADD PRIMARY KEY (`rtrID`);

--
-- Indexes for table `releasetypes`
--
ALTER TABLE `releasetypes`
  ADD PRIMARY KEY (`retID`);

--
-- Indexes for table `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`rolID`);

--
-- Indexes for table `seasons`
--
ALTER TABLE `seasons`
  ADD PRIMARY KEY (`ssnID`);

--
-- Indexes for table `series`
--
ALTER TABLE `series`
  ADD PRIMARY KEY (`serID`);

--
-- Indexes for table `sorttypes`
--
ALTER TABLE `sorttypes`
  ADD PRIMARY KEY (`styID`);

--
-- Indexes for table `subgenres`
--
ALTER TABLE `subgenres`
  ADD PRIMARY KEY (`sgnID`);

--
-- Indexes for table `subseries`
--
ALTER TABLE `subseries`
  ADD PRIMARY KEY (`ssrID`);

--
-- Indexes for table `system`
--
ALTER TABLE `system`
  ADD PRIMARY KEY (`sysID`);

--
-- Indexes for table `tracks`
--
ALTER TABLE `tracks`
  ADD PRIMARY KEY (`traID`);

--
-- Indexes for table `tracktypes`
--
ALTER TABLE `tracktypes`
  ADD PRIMARY KEY (`ttyID`);

--
-- Indexes for table `user`
--
ALTER TABLE `user`
  ADD PRIMARY KEY (`usrID`);

--
-- Indexes for table `userroles`
--
ALTER TABLE `userroles`
  ADD PRIMARY KEY (`uroID`);

--
-- Indexes for table `usersettings`
--
ALTER TABLE `usersettings`
  ADD PRIMARY KEY (`setID`);

--
-- Indexes for table `websites`
--
ALTER TABLE `websites`
  ADD PRIMARY KEY (`webID`);

--
-- Indexes for table `websitetypes`
--
ALTER TABLE `websitetypes`
  ADD PRIMARY KEY (`wstID`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `system`
--
ALTER TABLE `system`
  MODIFY `sysID` int(11) NOT NULL AUTO_INCREMENT COMMENT 'System setting ID', AUTO_INCREMENT=8;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
