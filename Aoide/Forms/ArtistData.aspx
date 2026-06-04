<%@ Page Language="C#" AutoEventWireup="true" CodeBehind="ArtistData.aspx.cs" Inherits="MediaBinger.Forms.ArtistData" %>

<!DOCTYPE html>

<html xmlns="http://www.w3.org/1999/xhtml">
<head runat="server">
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous" />
    <link href="https://maxcdn.bootstrapcdn.com/font-awesome/4.6.1/css/font-awesome.min.css" rel="stylesheet" />
    <link href='https://fonts.googleapis.com/css?family=Lexend' rel='stylesheet' />
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
    <link rel="stylesheet" href="https://cdn.materialdesignicons.com/5.4.55/css/materialdesignicons.min.css" />
    <link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkStyles" href="~/Styles/Main.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkNavBar" href="~/Styles/NavBar.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSectionBar" href="~/Styles/SectionBar.css" />
    <link rel="stylesheet" runat="server" media="screen" name="linkStyles" id="linkSlider" href="~/Styles/splide-teal.min.css" />
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <title>MediaBinger - Artist Info</title>
</head>
<body runat="server" id="modArtBody">
    <form id="form1" runat="server">

        <div class="editArtist" style="float: right;">
            <asp:Button ID="artSubmit" runat="server" Text="✔" CssClass="btn btn-mini" OnClick="submit_Click" Style="display: none; color: aliceblue; opacity:0.4" />
            <a runat="server" id="artEdit" class="btn btn-mini" title="Edit" style="color: aliceblue; opacity:0.4" href="javascript:void(0)"><i class="fa fa-pencil" aria-hidden="true"></i></a>
            <a runat="server" id="artSave" class="btn btn-mini" title="Save" style="color: aliceblue; opacity:0.4;display:none" href="javascript:void(0)"><i class="fa fa-check" aria-hidden="true"></i></a>
        </div>

        <div class="form-inline row">

            <div class="col-5" id="divArtistPicture" style="margin-top: 8%; padding-bottom: 59px">
                <asp:FileUpload ID="usrImage" runat="server" name="usrImage" class="form-control inputField inputImage" Style="display: none"></asp:FileUpload>
                <div id="picPreview" runat="server" class="centered" style="background-image: url('/Images/System/poster_V.jpg'); background-size: cover; background-position: center top; max-width: 300px; min-height: 300px; border-radius: 50%"></div>
            </div>

            <div class="col-7" id="divUserData" >

                <input runat="server" id="artName" type="text" name="artName" class="form-control inputFieldSecondary artDataField" disabled placeholder="Artist Data" style="width: 80%; font-size:25px;font-weight:bold; margin-left:-10px" />
                <input runat="server" id="artID" type="text" name="artID" class="form-control inputFieldSecondary artDataField" style="display:none" />
                <br />
                <div runat="server" id="artLineBirthName" class="artDatLine" style="display: none">
                    <span runat="server" id="spanArtBirthName" class="spanArtLabel modalSpanSecond">Birth name: </span>
                    <input runat="server" id="artBirthName" type="text" name="artBirthName" class="form-control inputFieldSecondary artDataField" disabled placeholder="Birth name" style="width: 80%" />
                </div>

                <div runat="server" id="artLineAlias" class="artDatLine" style="display: none">
                    <span runat="server" id="spanArtAlias" class="spanArtLabel modalSpanSecond">Other names: </span>
                    <input runat="server" id="artAlias" type="text" name="artAlias" class="form-control inputFieldSecondary artDataField" disabled placeholder="Alias" style="width: 60%"/>
                </div>

                <div runat="server" id="artLineOrigin" class="artDatLine" style="display: none">
                    <span runat="server" id="spanArtOrigin" class="spanArtLabel modalSpanSecond">Origin: </span>
                    <input runat="server" id="artOrigin" type="text" name="artOrigin" class="form-control inputFieldSecondary artDataField" style="display: none" disabled placeholder="Origin" />
                    <div runat="server" id="divOrigin" class="divOrigin" style="display: none">
                    </div>
                </div>
                <div runat="server" id="artLinePlaces" class="artLinePlaces" style="display: none">
                    <span runat="server" id="labOrigin" class="spanArtLabel modalSpanSecond">Origin: </span>
                    <input runat="server" id="artCountry" type="text" name="artCountry" class="form-control inputFieldSecondary artDataField" style="display: inline-block" placeholder="Country" />
                    <input runat="server" id="artCity" type="text" name="artCity" class="form-control inputFieldSecondary artDataField" style="display: inline-block" placeholder="City" />
                    <div runat="server" id="div2" class="divOrigin" style="display: none">
                    </div>
                </div>

                <div runat="server" id="artLineAge" class="artDatLine" style="display: none">
                    <span runat="server" id="spanArtAge" class="spanArtLabel modalSpanSecond">Age: </span>
                    <input runat="server" id="artAge" type="text" name="artAge" class="form-control inputFieldSecondary artDataField" disabled placeholder="Age" style="width: 80%" />
                </div>
                <div runat="server" id="artLineDates" class="devDates" style="display: none; margin-top: 3px">
                    <span class="spanArtLabel modalSpanSecond">Birth: </span>
                    <input runat="server" type="date" class="inputFieldSecondary" id="dtBirthDate" name="dtBirthDate" style="display: inline-block" />
                    <span class="spanArtLabel modalSpanSecond">Death: </span>
                    <input runat="server" type="date" class="inputFieldSecondary" id="dtDeathDate" name="dtDeathDate" style="display: inline-block" />
                </div>

                <div runat="server" id="artLineProjects" class="artDatLine" style="display: none">
                    <span runat="server" id="spanArtRelated" class="spanArtLabel modalSpanSecond" style="">Related Projects: </span>
                    <input runat="server" id="artRelated" type="text" name="artRelated" class="form-control inputFieldSecondary artDataField" disabled style="display: none" placeholder="Projects" />
                    <div runat="server" id="divRelated" class="divRelated" style="display: none;font-size:12px">
                    </div>
                </div>
                <div runat="server" id="artLineParticipations" class="artDatLine" style="display: none">
                    
                </div>
            </div>
        </div>
    </form>
    <script src="https://code.jquery.com/jquery-3.6.0.js" integrity="sha256-H+K7U5CnXl1h5ywQfKtSj8PCmoN9aaq30gDh27Xc0jk=" crossorigin="anonymous"></script>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <script src="/JS/Navbar.js" type="text/javascript"></script>
    <script src="/JS/Registry.js" type="text/javascript"></script>
    <script src="/JS/SectionBar.js" type="text/javascript"></script>
    
    <script src="https://code.jquery.com/ui/1.12.1/jquery-ui.js" integrity="sha256-T0Vest3yCU7pafRw9r+settMBX6JkKN06dqBnpQ8d30=" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.14.7/umd/popper.min.js" integrity="sha384-UO2eT0CpHqdSJQ6hJty5KVphtPhzWj9WO1clHTMGa3JDZwrnQq4sF86dIHNDz0W1" crossorigin="anonymous"></script>
    <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js" integrity="sha384-JjSmVgyd0p3pXB1rRibZUAYoIIy6OrQ6VrjIEaFf/nJGzIxFDsf4x0xIM+B07jRM" crossorigin="anonymous"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-datepicker/1.9.0/js/bootstrap-datepicker.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>
    
    <script>


</script>
</body>
</html>
