<%@ Page Language="C#" AutoEventWireup="true" CodeBehind="PlaylistData.aspx.cs" Inherits="Aoide.Forms.PlaylistData" %>

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
    <title>Add to Playlist</title>
</head>
<body>
    <form id="form1" runat="server">

        <div class="playlistButtons" style="float: right;">
            <asp:Button ID="playlistSubmit" runat="server" Text="✔" CssClass="btn btn-mini" OnClick="submit_Click" Style="display: none; color: aliceblue; opacity: 0.4" />
            <a runat="server" id="playlistSave" class="btn btn-mini" title="Save" style="color: aliceblue; opacity: 0.4; cursor: pointer" href="javascript:void(0)"><i class="fa fa-check" aria-hidden="true"></i></a>
        </div>

        <div runat="server" id="divPlaylistModalContent" name="divPlaylistModal" class="container-fluid" style="width: 100%;">
            <p runat="server" id="pPlaylist" style="font-size: 24px; font-weight: bold; padding: 20px">Add to playlist</p>
            <p runat="server" id="pPlaylistDescription" style="font-size: 16px; padding-left: 20px">Select a playlist or create a new one</p>
            <div class="row divPlaylistRow" style="padding: 20px">
                <div class="col-4">
                    <select id="playlistList" name="playlistList" runat="server" class="form-control inputField input-lg select2" style="cursor: pointer">
                        <option value="NaN" disabled="disabled">Select a playlist</option>
                    </select>
                </div>
                <div class="col-1" style="padding-top: 20px; text-align: center">
                    <span runat="server" id="spanOr">or </span>
                </div>
                <div class="col-1" id="divUserPicture">

                    <asp:FileUpload ID="playlistImage" runat="server" name="playlistImage" class="form-control inputField inputImage" Style="display: none"></asp:FileUpload>
                    <img id="playlistPreview" class="picturePreview centered systemImage" src="/Images/System/folder-square.jpg" alt="playlistImage" style="margin-right:-30px; margin-top:9px;width: 50px; height:50px; float:right;" />
                    
                </div>

                <div class="col-5">
                    <input runat="server" id="playlistName" type="text" name="playlistName" class="form-control dark-mode-secondary-page bndDataField" placeholder="Insert playlist name" style="cursor: pointer; display: inline-block; width: 80%; margin-top: 16px; font-size: 14px;" />
                </div>
            </div>
            <div class="row divPlaylistRow2" style="padding: 20px">
                <p runat="server" id="pPlaylistClose" style="font-size: 16px; font-weight: bold; padding: 20px"></p>
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
        $(".playlistButtons").css({ "display": "block" });
        $(".divPlaylistRow").css({ "display": "flex" });
        $("#pPlaylistClose").text("");
        $(".divPlaylistRow2").css({ "display": "none" });

        $("#playlistSave").on("click", function () {
            var strPlaylistSelect = $('#playlistList option').filter(':selected').val();
            var strPlaylistName = $('#playlistName').val();

            //Playlist CRUD
            $.ajax({
                type: "POST",
                async: false,
                url: "/Forms/PlaylistData.aspx/SavePlaylistChanges",
                data: JSON.stringify({
                    'strPlaylistSelect': strPlaylistSelect,
                    'strPlaylistName': strPlaylistName
                }),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: function (data) {
                    $(".playlistButtons").css({ "display": "none" });
                    $(".divPlaylistRow").css({ "display": "none" });
                    $("#pPlaylistClose").text(data.d)
                    $(".divPlaylistRow2").css({ "display": "block" });
                    $("#playlistSubmit").click();

                    setTimeout(function () {
                        window.location.reload();
                    }, 5000);

                }
            });
        });

    </script>
</body>
</html>
